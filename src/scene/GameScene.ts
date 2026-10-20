import { Camera, Clock, Plane, Raycaster, Scene, Sphere, Vector3, VSMShadowMap, WebGLRenderer } from "three";
import Stats from "stats.js";
import AiDebugView from "@/ai/AiDebugView";
import type NavGrid from "@/ai/NavGrid";
import Entity from "@/entities/Entity";
import PlayerTank from "@/entities/tanks/PlayerTank";
import TreadsCanvas from "@/map/TreadsCanvas";
import CameraManager from "@/scene/managers/CameraManager";
import EntityManager from "@/scene/managers/EntityManager";
import InputManager from "@/scene/managers/InputManager";
import LightingManager from "@/scene/managers/LightingManager";
import type Stage from "@/scene/stages/Stage";
import BattleStage from "@/scene/stages/BattleStage";
import PlaygroundStage from "@/scene/stages/PlaygroundStage";
import type PhysicsWorld from "@/physics/PhysicsWorld";
import { shatter } from "@/physics/Shatter";
import OrthographicStrategy from "@/scene/cameraStrategies/OrthographicStrategy";
import PerspectiveStrategy from "@/scene/cameraStrategies/PerspectiveStrategy";
import Hud from "@/ui/Hud";
import ResourceManager from "@/utils/ResourceManager";
import { LEVEL_TRANSITION_TIME, MAP_SIZE, MAX_FRAME_DELTA } from "@/config";

type LevelState = "loading" | "playing" | "ended";

class GameScene {
    private static _instance = new GameScene();
    public static get instance() {
        return this._instance;
    }

    private readonly _scene = new Scene();
    private readonly _clock = new Clock();
    private readonly _entityManager = new EntityManager(MAP_SIZE);
    private readonly _input = InputManager.instance;

    /** The scenes that N cycles through. */
    private readonly _stages: Stage[] = [new BattleStage(), new PlaygroundStage()];
    private _stageIndex = 0;

    private _renderer!: WebGLRenderer;
    private _cameraManager!: CameraManager;
    private _stats!: Stats;
    private _hud!: Hud;
    private _aiDebug!: AiDebugView;

    private _player: PlayerTank | null = null;
    private _treads: TreadsCanvas | null = null;

    private _levelState: LevelState = "loading";
    private _levelEndTimer = 0;
    /** Bumped on every level reset so entities still loading for the old level get dropped. */
    private _levelGeneration = 0;

    private _pausedByCamera = false;
    private _pausedByVisibility = false;

    private readonly _raycaster = new Raycaster();
    private readonly _groundPlane = new Plane(new Vector3(0, 0, 1), 0);
    private readonly _mouseWorldPosition = new Vector3();

    private constructor() {
        window.addEventListener("resize", this.resize);
        document.addEventListener("visibilitychange", this.handleVisibilityChange);
        this._input.onKeyDown("Digit1", this.toggleCamera);
        this._input.onKeyDown("Digit2", this.toggleAiDebug);
        this._input.onKeyDown("KeyN", this.nextStage);
    }

    // ---- Setup ---------------------------------------------------------------------------

    public async load(): Promise<void> {
        this.initializeRenderer();
        this._input.attach(this._renderer.domElement);

        this._stats = new Stats();
        this._stats.showPanel(0);
        document.body.appendChild(this._stats.dom);

        this._hud = new Hud();
        this._aiDebug = new AiDebugView(this._scene);
        this._cameraManager = new CameraManager(new OrthographicStrategy(this._renderer, MAP_SIZE));

        await ResourceManager.instance.load();

        const indicators = new LightingManager().setupLights(this._scene, MAP_SIZE);
        await Promise.all(indicators.map(this.spawn));

        await this.startLevel();
    }

    private initializeRenderer(): void {
        this._renderer = new WebGLRenderer({ alpha: true, antialias: true });
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this._renderer.setSize(window.innerWidth, window.innerHeight);
        this._renderer.shadowMap.enabled = true;
        this._renderer.shadowMap.type = VSMShadowMap;

        const target = document.querySelector<HTMLDivElement>("#app");
        if (!target) throw new Error("Unable to find #app element");
        target.appendChild(this._renderer.domElement);
    }

    // ---- Public API used by entities ----------------------------------------------------

    /**
     * Loads an entity and adds it to the game. This is the only way entities should enter
     * the scene, so they are always fully loaded (mesh + collider) before they're updated.
     */
    public spawn = async <T extends Entity>(entity: T): Promise<T> => {
        const generation = this._levelGeneration;
        await entity.load();

        if (generation !== this._levelGeneration && !entity.persistent) {
            // The level was reset while this was loading
            entity.shouldDispose = true;
            entity.dispose();
            return entity;
        }

        this._entityManager.add(entity);
        this._scene.add(entity.mesh);
        return entity;
    };

    /** Adds an entity that's already loaded right away (not at the end of an await). */
    private addLoaded(entity: Entity): void {
        this._entityManager.add(entity);
        this._scene.add(entity.mesh);
    }

    public queryColliders(sphere: Sphere, exclude?: Entity): Entity[] {
        return this._entityManager.queryColliders(sphere, exclude);
    }

    public shakeCamera(duration: number, intensity = 0.5): void {
        this._cameraManager.shake(duration, intensity);
    }

    public notify(text: string): void {
        this._hud.flash(text);
    }

    public get entities(): readonly Entity[] {
        return this._entityManager.entities;
    }

    /** The physics simulation (cannon-es). */
    public get physics(): PhysicsWorld {
        return this._entityManager.physics;
    }

    /** The scene being played. */
    public get stage(): Stage {
        return this._stages[this._stageIndex];
    }

    /** The AI's map knowledge: walkable tiles, path finding and line of sight. */
    public get navGrid(): NavGrid {
        return this._entityManager.navGrid;
    }

    public get camera(): Camera {
        return this._cameraManager.camera;
    }

    public get paused(): boolean {
        return this._pausedByCamera || this._pausedByVisibility;
    }

    /** The living player tank, or null if it's dead / not spawned yet. */
    public get player(): PlayerTank | null {
        return this._player && !this._player.shouldDispose ? this._player : null;
    }

    public get treadsCanvas(): TreadsCanvas | null {
        return this._treads;
    }

    /** Where the mouse cursor hits the ground plane. Updated once per frame. */
    public get mouseWorldPosition(): Vector3 {
        return this._mouseWorldPosition;
    }

    // ---- Game loop -----------------------------------------------------------------------

    public render = (): void => {
        requestAnimationFrame(this.render);
        this._stats.begin();

        const deltaT = Math.min(this._clock.getDelta(), MAX_FRAME_DELTA);
        this._cameraManager.update(deltaT, this._clock.elapsedTime);
        this.updateMouseWorldPosition();

        if (!this.paused) {
            this._entityManager.update(deltaT);
            this.updateLevelState(deltaT);
        }

        this._entityManager.removeDisposed(this.breakApart);
        this._aiDebug.update(this._entityManager.entities);

        this._renderer.render(this._scene, this._cameraManager.camera);
        this._stats.end();
    };

    /** Replaces a destroyed entity by pieces made from its meshes, in the same frame. */
    private breakApart = (entity: Entity): void => {
        if (!entity.impact) return;
        for (const shard of shatter(entity)) {
            shard.build();
            this.addLoaded(shard);
        }
    };

    private updateMouseWorldPosition(): void {
        this._raycaster.setFromCamera(this._input.mousePosition, this._cameraManager.camera);
        // Keeps the previous value if the ray doesn't hit the ground (e.g. looking at the sky)
        this._raycaster.ray.intersectPlane(this._groundPlane, this._mouseWorldPosition);
    }

    // ---- Level flow ----------------------------------------------------------------------

    private async startLevel(): Promise<void> {
        this._levelState = "loading";
        this._hud.hideMessage();
        this._hud.setTitle(this.stage.title);

        const { player, treads } = await this.stage.build(this.spawn, MAP_SIZE);
        this._player = player;
        this._treads = treads;
        this._levelState = "playing";
    }

    private updateLevelState(deltaT: number): void {
        if (this._levelState === "playing") {
            if (!this.player) {
                this.endLevel(false);
            } else if (this.stage.isCleared(this._entityManager.entities)) {
                this.endLevel(true);
            }
        } else if (this._levelState === "ended") {
            this._levelEndTimer -= deltaT;
            if (this._levelEndTimer <= 0) this.restartLevel();
        }
    }

    private endLevel(won: boolean): void {
        this._levelState = "ended";
        this._levelEndTimer = LEVEL_TRANSITION_TIME;
        this._hud.showMessage(won ? this.stage.onCleared() : this.stage.onFailed());
    }

    private restartLevel(): void {
        this._levelGeneration++;
        this._entityManager.removeWhere((entity) => !entity.persistent);
        this._player = null;
        this._treads = null;
        void this.startLevel();
    }

    // ---- Events --------------------------------------------------------------------------

    private toggleCamera = (): void => {
        if (!this._cameraManager) return; // Not loaded yet

        const next = this._cameraManager.strategy instanceof OrthographicStrategy
            ? new PerspectiveStrategy(this._renderer, MAP_SIZE)
            : new OrthographicStrategy(this._renderer, MAP_SIZE);

        this._cameraManager.setStrategy(next);
        this._pausedByCamera = next.pausesGame;
        this._hud.flash(next.pausesGame ? "Free camera (paused)" : "Top-down camera");
    };

    /** Switches to the next scene (battle, physics playground, ...). */
    private nextStage = (): void => {
        if (this._levelState === "loading") return; // Let the current one finish building first

        this._stageIndex = (this._stageIndex + 1) % this._stages.length;
        this._hud.flash(`${this.stage.name} (N: next scene)`, 2000);
        this.restartLevel();
    };

    private toggleAiDebug = (): void => {
        if (!this._aiDebug) return; // Not loaded yet
        this._hud.flash(this._aiDebug.toggle() ? "AI debug view on" : "AI debug view off");
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

export default GameScene;
