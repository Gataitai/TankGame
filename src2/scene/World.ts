import { AmbientLight, Clock, Color, Fog, HemisphereLight, Scene, Vector3, VSMShadowMap, WebGLRenderer } from "three";
import Stats from "stats.js";
import Ecs from "@2/ecs/Ecs";
import type System from "@2/ecs/System";
import { Disposable, Renderable } from "@2/components/Visual";
import { LightSource, Persistent, PlayerControl } from "@2/components/Gameplay";
import { PhysicsBody } from "@2/components/Spatial";
import PhysicsWorld from "@2/physics/PhysicsWorld";
import { Palette } from "@2/render/Materials";
import { releaseRenderable } from "@2/prefabs/props";
import { releaseLight, spawnLamp, spawnSun } from "@2/prefabs/lights";
import { spawnPlayer } from "@2/prefabs/player";
import BreakSystem, { breakQueueLength } from "@2/systems/BreakSystem";
import DebrisSystem from "@2/systems/DebrisSystem";
import LifetimeSystem from "@2/systems/LifetimeSystem";
import MotionSystem from "@2/systems/MotionSystem";
import ParticleSystem from "@2/systems/ParticleSystem";
import PhysicsSystem from "@2/systems/PhysicsSystem";
import PlayerSystem from "@2/systems/PlayerSystem";
import CameraManager from "@2/scene/managers/CameraManager";
import InputManager from "@2/scene/managers/InputManager";
import FirstPersonStrategy from "@2/scene/cameraStrategies/FirstPersonStrategy";
import type { ViewTarget } from "@2/scene/cameraStrategies/CameraStrategy";
import { setGame } from "@2/scene/Game";
import type Stage from "@2/scene/stages/Stage";
import SandboxStage from "@2/scene/stages/SandboxStage";
import Hud from "@2/ui/Hud";
import { MAP_SIZE, MAX_FRAME_DELTA } from "@2/config";

const SKY_COLOR = 0xa9d2ef;
const FOG_NEAR = 60;
const FOG_FAR = 260;

/** Where the camera sits before the player exists. */
const START_PITCH = -0.45;
const START_HEIGHT = 14;

/**
 * Owns the renderer, the scene, the entity registry and the frame loop.
 *
 * All the actual work happens in systems, run in the order set up by buildPipeline(). World itself
 * only decides when, and puts the shared pieces into the game context so prefabs, systems and
 * weapons can reach them (see Game.ts).
 */
class World {
    private static _instance = new World();
    public static get instance() {
        return this._instance;
    }

    private readonly _scene = new Scene();
    private readonly _clock = new Clock();
    private readonly _ecs = new Ecs();
    private readonly _physics = new PhysicsWorld();
    private readonly _input = InputManager.instance;

    /** The scenes that N cycles through. Add stages here. */
    private readonly _stages: Stage[] = [new SandboxStage()];
    private _stageIndex = 0;

    private _renderer!: WebGLRenderer;
    private _cameraManager!: CameraManager;
    private _stats!: Stats;
    private _hud!: Hud;

    private _systems: System[] = [];
    private _playerSystem!: PlayerSystem;

    private readonly _view: ViewTarget = { position: new Vector3(), yaw: 0, pitch: 0 };
    private _pausedByVisibility = false;

    private constructor() {
        window.addEventListener("resize", this.resize);
        document.addEventListener("visibilitychange", this.handleVisibilityChange);
        this._input.onKeyDown("KeyR", this.rebuildStage);
        this._input.onKeyDown("KeyN", this.nextStage);
    }

    // ---- Setup ---------------------------------------------------------------------------

    public async load(): Promise<void> {
        this.initializeRenderer();
        this._input.attach(this._renderer.domElement);
        this._input.onPointerLockChange(this.handlePointerLockChange);

        this._stats = new Stats();
        this._stats.showPanel(0);
        document.body.appendChild(this._stats.dom);

        this._hud = new Hud();
        this.setupEnvironment();

        // Look over the map from above until the player is spawned
        this._view.position.set(-MAP_SIZE / 3, -MAP_SIZE / 3, START_HEIGHT);
        this._view.yaw = Math.PI / 4;
        this._view.pitch = START_PITCH;
        this._cameraManager = new CameraManager(new FirstPersonStrategy(this._renderer, this._view));

        setGame({
            ecs: this._ecs,
            physics: this._physics,
            scene: this._scene,
            camera: this._cameraManager,
            hud: this._hud,
        });

        this.registerComponentCleanup();
        this.buildPipeline();
        this.setupLights();
        this.buildStage();
    }

    private initializeRenderer(): void {
        this._renderer = new WebGLRenderer({ antialias: true });
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        this._renderer.shadowMap.enabled = true;
        this._renderer.shadowMap.type = VSMShadowMap;

        const target = document.querySelector<HTMLDivElement>("#app");
        if (!target) throw new Error("Unable to find #app element");
        target.appendChild(this._renderer.domElement);
    }

    /** Blue sky, matching fog, and enough fill light that white props never go flat black. */
    private setupEnvironment(): void {
        this._scene.background = new Color(SKY_COLOR);
        this._scene.fog = new Fog(SKY_COLOR, FOG_NEAR, FOG_FAR);
        // Sky above, bounced light from the pale ground below: what makes a white scene read
        this._scene.add(new HemisphereLight(SKY_COLOR, Palette.ground, 1.1));
        this._scene.add(new AmbientLight(0xffffff, 0.35));
    }

    /** The lights. Persistent, so they survive a stage rebuild. */
    private setupLights(): void {
        const size = this.stage.mapSize;
        spawnSun(new Vector3(size * 0.45, -size * 0.35, size * 0.9), 0xfff6e8, {
            intensity: 2.1,
            target: new Vector3(0, 0, 0),
            shadowRadius: size * 0.8,
        });
        spawnLamp(new Vector3(10, 10, 5), 0xffd9a8, { intensity: 40, range: 24 });
        spawnLamp(new Vector3(-14, 8, 5), 0xa8d4ff, { intensity: 40, range: 24 });
    }

    /**
     * How a component frees what it owns. Registered once here so no call site can forget it: the
     * Ecs runs these whenever a component is dropped or its entity destroyed.
     */
    private registerComponentCleanup(): void {
        Renderable.onRemove = releaseRenderable;
        PhysicsBody.onRemove = ({ body }) => this._physics.remove(body);
        LightSource.onRemove = releaseLight;
        Disposable.onRemove = ({ dispose }) => dispose();
    }

    /**
     * The order the frame runs in, and why:
     * 1. player   reads input and sets the velocity the simulation is about to use
     * 2. motion   flies projectiles, which may destroy things
     * 3. physics  steps the simulation and writes where everything ended up
     * 4. lifetime ages out effects and debris
     * 5. particles animates what's left of them
     * 6. break    cuts up what was destroyed, within its frame budget
     * 7. debris   keeps the pile of pieces under its cap
     */
    private buildPipeline(): void {
        this._playerSystem = new PlayerSystem();
        this._systems = [
            this._playerSystem,
            new MotionSystem(),
            new PhysicsSystem(),
            new LifetimeSystem(),
            new ParticleSystem(),
            new BreakSystem(),
            new DebrisSystem(),
        ];
    }

    // ---- Accessors -----------------------------------------------------------------------

    public get stage(): Stage {
        return this._stages[this._stageIndex];
    }

    public get paused(): boolean {
        return this._pausedByVisibility;
    }

    // ---- Frame ---------------------------------------------------------------------------

    public render = (): void => {
        requestAnimationFrame(this.render);
        this._stats.begin();

        const deltaT = Math.min(this._clock.getDelta(), MAX_FRAME_DELTA);
        if (!this.paused) {
            for (const system of this._systems) system.update(deltaT);
            this._ecs.flush();
        }

        // After the systems, so the camera shows where the player is now and not a frame ago
        const view = this._playerSystem.view;
        if (view) {
            this._view.position.copy(view.position);
            this._view.yaw = view.yaw;
            this._view.pitch = view.pitch;
        }
        this._cameraManager.update(deltaT, this._clock.elapsedTime, this._view);

        // The queue only shows a number when breaking is actually running behind, which is the
        // one thing worth watching while tuning BREAK_BUDGET_MS
        const queued = breakQueueLength();
        this._hud.setTitle(queued > 0 ? `${this.stage.title} · breaking ${queued}` : this.stage.title);
        this._hud.setWeapon(this._playerSystem.weaponName);
        this._renderer.render(this._scene, this._cameraManager.camera);
        this._stats.end();
    };

    // ---- Stage flow ----------------------------------------------------------------------

    private buildStage(): void {
        this.stage.build();

        const { x, y, yaw } = this.stage.playerStart;
        spawnPlayer(new Vector3(x, y, 0), yaw);
    }

    /** Puts everything back (handy once you've blown the sandbox apart). */
    private rebuildStage = (): void => {
        for (const system of this._systems) system.reset?.();
        // The lights stay; the player is rebuilt along with the rest so it returns to its start
        this._ecs.clear((entity) =>
            this._ecs.has(entity, Persistent) && !this._ecs.has(entity, PlayerControl));
        this.buildStage();
    };

    /** Switches to the next scene. */
    private nextStage = (): void => {
        this._stageIndex = (this._stageIndex + 1) % this._stages.length;
        this._hud.flash(`${this.stage.name} (N: next scene)`, 1600);
        this.rebuildStage();
    };

    // ---- Events --------------------------------------------------------------------------

    private handlePointerLockChange = (): void => {
        this._hud.setPlaying(this._input.pointerLocked);
    };

    private handleVisibilityChange = (): void => {
        this._pausedByVisibility = document.hidden;
    };

    private resize = (): void => {
        if (!this._renderer) return;
        const width = window.innerWidth;
        const height = window.innerHeight;
        this._renderer.setSize(width, height);
        this._cameraManager.resize(width, height);
    };
}

export default World;
