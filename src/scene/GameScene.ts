// GameScene.ts
import {
    Clock,
    Scene, Vector3,
    VSMShadowMap,
    WebGLRenderer
} from "three";
import Stats from "stats.js";
import ResourceManager from "@/utils/ResourceManager";
import PlayerTank from "@/entities/tanks/PlayerTank";
import EnemyTank from "@/entities/tanks/EnemyTank";
import EntityManager from "@/scene/managers/EntityManager.ts";
import LightingManager from "@/scene/managers/LightingManager.ts";
import InputManager from "@/scene/managers/InputManager.ts";
import OrthographicStrategy from "@/scene/cameraStrategies/OrthographicStratety.ts";
import GameMap from "@/map/GameMap.ts";
import PerspectiveStrategy from "@/scene/cameraStrategies/PerspectiveStrategy.ts";
import Entity from "@/entities/Entity.ts";
import CameraManager from "@/scene/managers/CameraManager.ts";
import LightIndicator from "@/entities/lights/LightIndicator.ts";

class GameScene {
    private static _instance = new GameScene();
    public static get instance() {
        return this._instance;
    }

    private _width!: number;
    private _height!: number;
    private _renderer!: WebGLRenderer;
    private _scene: Scene = new Scene();
    private _clock: Clock = new Clock();
    private _mapSize: number = 25;
    private _playerTank!: PlayerTank;
    private _stats!: Stats;
    private _paused: boolean = false;

    // Managers
    private _entityManager = new EntityManager();
    private _lightingManager = new LightingManager();
    private _cameraManager = new CameraManager();
    private _input = InputManager.instance;

    private constructor() {
        this.initializeWindowDimensions();
        this.setupResizeListener();
        this.setupVisibilityChangeListener();

        // Register a callback for the '1' key to toggle camera strategy
        this._input.onKeyPress("1", this.toggleCamera);
    }

    private initializeWindowDimensions(): void {
        this._width = window.innerWidth;
        this._height = window.innerHeight;
    }

    private setupResizeListener(): void {
        window.addEventListener("resize", this.resize, false);
    }

    private setupVisibilityChangeListener(): void {
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                this._paused = true; // Pause when not visible
            } else if (this._cameraManager.isOrthographic()) {
                this._paused = false;
                this._clock.start();
            }
        });
    }

    private toggleCamera = () => {
        if (this._cameraManager.isOrthographic()) {
            this._cameraManager.setCameraStrategy(new PerspectiveStrategy(), this._renderer, this._mapSize);
            console.log("Switched to Perspective Camera");
        } else {
            this._cameraManager.setCameraStrategy(new OrthographicStrategy(), this._renderer, this._mapSize);
            console.log("Switched to Orthographic Camera");
        }
        this._paused = !this._paused;
    };

    private initializeRenderer(): void {
        this._renderer = new WebGLRenderer({ alpha: true, antialias: true });
        this._renderer.setPixelRatio(window.devicePixelRatio);
        this._renderer.setSize(this._width, this._height);
        this._renderer.shadowMap.enabled = true;
        this._renderer.shadowMap.type = VSMShadowMap;

        const targetElement = document.querySelector<HTMLDivElement>("#app");
        if (!targetElement) {
            throw new Error("Unable to find target element");
        }
        targetElement.appendChild(this._renderer.domElement);
    }

    private initializeStats(): void {
        this._stats = new Stats();
        this._stats.showPanel(0);
        document.body.appendChild(this._stats.dom);
    }

    private initializeCamera(): void {
        this._cameraManager.setupCamera(this._renderer, this._mapSize);
    }

    private initializeEntities(): void {
        const gameMap = new GameMap(new Vector3(0, 0, 0), this._mapSize);
        this._entityManager.addEntity(gameMap);

        this._playerTank = new PlayerTank(
            new Vector3(3, 3, 0)
        );
        this._entityManager.addEntity(this._playerTank);

        const enemyPositions = [
            new Vector3(this._mapSize - 4, 3, 0),
            new Vector3(3, this._mapSize - 4, 0),
            new Vector3(this._mapSize - 4, this._mapSize - 4, 0),
        ];

        enemyPositions.forEach((position) => {
            this._entityManager.addEntity(new EnemyTank(position));
        });
    }

    public async load(): Promise<void> {
        this.initializeRenderer();
        this.initializeStats();
        this.initializeCamera();
        await ResourceManager.instance.load();

        this.initializeEntities();
        this._lightingManager.setupLights(this._scene, this._entityManager, this._mapSize);


        // Load all entities
        for (let entity of this._entityManager.entities) {
            await entity.load();
            if (entity.mesh) {
                // Only set shadows if it's not a LightIndicator
                if (!(entity instanceof LightIndicator)) {
                    entity.mesh.castShadow = true;
                    entity.mesh.receiveShadow = true;
                }
                this._scene.add(entity.mesh);
            }
        }
    }

    public render = (): void => {
        requestAnimationFrame(this.render);

        this._stats.begin();
        const deltaT = this._clock.getDelta();
        const elapsedTime = this._clock.elapsedTime;

        this._cameraManager.applyCameraShake(deltaT, elapsedTime);

        if (!this._paused) {
            this._entityManager.update(deltaT);
        }

        const disposedEntities = this._entityManager.dispose();
        for (const entity of disposedEntities) {
            if (entity.mesh && entity.mesh.parent) {
                this._scene.remove(entity.mesh);
            }
        }

        this._renderer.render(this._scene, this._cameraManager.camera);
        this._stats.end();
    };

    public get camera() {
        return this._cameraManager.camera;
    }

    public get gameEntities() {
        return this._entityManager.entities;
    }

    public shakeCamera(duration: number, intensity: number = 0.5): void {
        this._cameraManager.shakeCamera(duration, intensity);
    }

    public addToScene(entity: Entity): void {
        this._entityManager.addEntity(entity);
        this._scene.add(entity.mesh);
    }

    private resize = (): void => {
        this._width = window.innerWidth;
        this._height = window.innerHeight;
        this._renderer.setSize(this._width, this._height);
        this._cameraManager.handleResize(this._width, this._height);
    };
}

export default GameScene;
