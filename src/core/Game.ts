import { Clock, VSMShadowMap, WebGLRenderer } from "three";
import Stats from "stats.js";
import type Scene from "@/scene/Scene";
import InputManager from "@/scene/managers/InputManager";
import Hud from "@/ui/Hud";
import { MAX_FRAME_DELTA } from "@/config";

/**
 * The engine: owns the renderer, the game loop, the HUD and pausing, and runs one Scene at a time.
 * It doesn't know anything about tanks or levels; that all lives in the scenes.
 */
class Game {
    public readonly renderer: WebGLRenderer;
    public readonly hud = new Hud();

    private readonly _stats = new Stats();
    private readonly _clock = new Clock();
    private _scene: Scene | null = null;
    private _loading = false;
    private _pausedByVisibility = false;

    constructor(container: HTMLElement) {
        this.renderer = new WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = VSMShadowMap;
        container.appendChild(this.renderer.domElement);

        this._stats.showPanel(0);
        document.body.appendChild(this._stats.dom);

        InputManager.instance.attach(this.renderer.domElement);
        window.addEventListener("resize", this.resize);
        document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }

    /** The scene currently running (null while switching scenes). */
    public get scene(): Scene | null {
        return this._scene;
    }

    /** Gameplay is paused while the tab is hidden or when the scene asks for it (free camera). */
    public get paused(): boolean {
        return this._pausedByVisibility || (this._scene?.pausesGame ?? false);
    }

    public get isLoading(): boolean {
        return this._loading;
    }

    /** Disposes the current scene and loads `scene` in its place. */
    public async loadScene(scene: Scene): Promise<void> {
        this._loading = true;
        const previous = this._scene;
        this._scene = null; // Nothing updates or renders while switching
        previous?.dispose();
        this.hud.reset();

        try {
            await scene.load(this);
            scene.resize(window.innerWidth, window.innerHeight);
            this._scene = scene;
        } finally {
            this._loading = false;
        }
    }

    /** Starts the game loop. */
    public start(): void {
        this._clock.start();
        requestAnimationFrame(this.loop);
    }

    private loop = (): void => {
        requestAnimationFrame(this.loop);
        this._stats.begin();

        // Clamped so a long stall (e.g. switching tabs) doesn't make things tunnel through walls
        const deltaT = Math.min(this._clock.getDelta(), MAX_FRAME_DELTA);
        const scene = this._scene;
        if (scene) {
            scene.update(deltaT, this._clock.elapsedTime, this.paused);
            this.renderer.render(scene.root, scene.camera);
        }

        this._stats.end();
    };

    private resize = (): void => {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this._scene?.resize(window.innerWidth, window.innerHeight);
    };

    private handleVisibilityChange = (): void => {
        this._pausedByVisibility = document.hidden;
    };
}

export default Game;
