import { Camera, Light, Plane, Raycaster, Scene as ThreeScene, Sphere, Vector3 } from "three";
import type Entity from "@/entities/Entity";
import type NavGrid from "@/ai/NavGrid";
import AiDebugView from "@/ai/AiDebugView";
import type Game from "@/core/Game";
import CameraManager from "@/scene/managers/CameraManager";
import EntityManager from "@/scene/managers/EntityManager";
import InputManager, { type Unsubscribe } from "@/scene/managers/InputManager";
import LightingManager from "@/scene/managers/LightingManager";
import PhysicsWorld from "@/physics/PhysicsWorld";
import ObjectBreaker from "@/physics/ObjectBreaker";
import type { PhysicsMode } from "@/physics/RigidBody";
import OrthographicStrategy from "@/scene/cameraStrategies/OrthographicStrategy";
import PerspectiveStrategy from "@/scene/cameraStrategies/PerspectiveStrategy";
import type Hud from "@/ui/Hud";

/**
 * Any entity class, also abstract ones or ones with a protected constructor,
 * e.g. `scene.find(PlayerTank)` or `scene.findAll(EnemyTank)`.
 */
export type EntityType<T extends Entity> = Function & { prototype: T };

export type AddOptions = {
    /**
     * "static" = immovable physics body, "dynamic" = simulated, "none" = no physics.
     * Defaults to the entity class's `defaultPhysics`.
     */
    physics?: PhysicsMode;
};

/**
 * A scene holds everything that makes up one playable world, like a scene in Unity: its entities
 * (game objects and their behaviour), the camera, the lights, the physics simulation and the
 * AI's map knowledge.
 *
 * The Game runs one scene at a time: it calls `load()` once, then `update()` every frame and
 * renders `root` through `camera`, and `dispose()` when switching to another scene.
 *
 * Concrete scenes only describe their content and rules by implementing `onLoad()` (build the
 * world) and optionally `onUpdate()` (scene rules such as win/lose conditions).
 * Entities talk to their scene through the public API below (via `entity.scene`).
 */
abstract class Scene {
    /** The three.js scene graph that everything in this scene is rendered from. */
    public readonly root = new ThreeScene();
    /** This scene's physics simulation; entities get bodies in it through `setPhysics()`. */
    public readonly physics: PhysicsWorld;
    /** Shatters entities into physics pieces (used by `entity.break()`). */
    public readonly breaker = new ObjectBreaker();
    public readonly mapSize: number;

    private readonly _entities: EntityManager;
    private _game: Game | null = null;
    private _cameraManager!: CameraManager;
    private _aiDebug!: AiDebugView;
    private readonly _unsubscribers: Unsubscribe[] = [];
    /** Bumped whenever entities are cleared, so entities still loading for the old content are dropped. */
    private _generation = 0;

    private readonly _raycaster = new Raycaster();
    private readonly _groundPlane = new Plane(new Vector3(0, 0, 1), 0);
    private readonly _mouseWorldPosition = new Vector3();

    protected constructor(mapSize: number) {
        this.mapSize = mapSize;
        this._entities = new EntityManager(mapSize);
        this.physics = new PhysicsWorld(mapSize);
    }

    // ---- Lifecycle (called by Game) ----------------------------------------------------

    public async load(game: Game): Promise<void> {
        this._game = game;
        this._cameraManager = new CameraManager(new OrthographicStrategy(game.renderer, this.mapSize));
        this._aiDebug = new AiDebugView(this.root);

        const input = InputManager.instance;
        this._unsubscribers.push(
            input.onKeyDown("Digit1", this.toggleCamera),
            input.onKeyDown("Digit2", this.toggleAiDebug),
        );

        await this.onLoad();
    }

    public update(deltaT: number, elapsedTime: number, paused: boolean): void {
        this._cameraManager.update(deltaT, elapsedTime);
        this.updateMouseWorldPosition();

        if (!paused) {
            // Like Unity: Update, then the physics step, then LateUpdate
            this._entities.update(deltaT);
            this.physics.step(deltaT);
            this._entities.lateUpdate(deltaT);
            this.onUpdate(deltaT);
        }

        this._entities.removeDisposed();
        this._aiDebug.update(this._entities.entities);
    }

    public resize(width: number, height: number): void {
        this._cameraManager.resize(width, height);
    }

    /** Frees everything this scene created. The scene can't be used afterwards. */
    public dispose(): void {
        this._generation++;
        this._unsubscribers.forEach((unsubscribe) => unsubscribe());
        this._entities.removeWhere(() => true);
        this._cameraManager.strategy.dispose();
        this._aiDebug.dispose();
        this.root.traverse((object) => {
            if ((object as Light).isLight) (object as Light).dispose();
        });
        this.root.clear();
    }

    /** The camera to render this scene with. */
    public get camera(): Camera {
        return this._cameraManager.camera;
    }

    /** Whether this scene wants gameplay paused (e.g. while the free camera is active). */
    public get pausesGame(): boolean {
        return this._cameraManager.strategy.pausesGame;
    }

    // ---- Hooks for concrete scenes -----------------------------------------------------

    /** Builds the scene's content (map, lights, tanks...). */
    protected abstract onLoad(): Promise<void>;

    /** Scene rules that run every (unpaused) frame after the entities have updated. */
    protected onUpdate(_deltaT: number): void {}

    // ---- Entities ----------------------------------------------------------------------

    /**
     * Adds an entity to the scene (like Instantiate in Unity): the entity is loaded first, so it
     * only starts updating and colliding once its mesh and collider exist. `options.physics`
     * chooses whether it's immovable ("static"), simulated ("dynamic") or has no physics.
     */
    public async add<T extends Entity>(entity: T, options: AddOptions = {}): Promise<T> {
        const generation = this._generation;
        entity.attachToScene(this);
        await entity.load();

        if (generation !== this._generation && !entity.persistent) {
            // The scene was cleared (or disposed) while this was loading
            entity.shouldDispose = true;
            entity.dispose();
            return entity;
        }

        this._entities.add(entity);
        this.root.add(entity.mesh);
        entity.setPhysics(options.physics ?? entity.defaultPhysics);
        entity.onAdded();
        return entity;
    }

    /**
     * Re-files an entity in the collision structures after `change` (e.g. a static wall that
     * became dynamic leaves the static grid and the AI's map). Used by Entity.setPhysics.
     */
    public reindex(entity: Entity, change: () => void): void {
        this._entities.reindex(entity, change);
    }

    /** All live entities. */
    public get entities(): readonly Entity[] {
        return this._entities.entities;
    }

    /** The first live entity of the given type, e.g. `scene.find(PlayerTank)`. */
    public find<T extends Entity>(type: EntityType<T>): T | null {
        for (const entity of this._entities.entities) {
            if (entity instanceof type && !entity.shouldDispose) return entity as T;
        }
        return null;
    }

    /** All live entities of the given type. */
    public findAll<T extends Entity>(type: EntityType<T>): T[] {
        return this._entities.entities.filter((entity): entity is T => entity instanceof type && !entity.shouldDispose);
    }

    /** Colliders touching the sphere (excluding `exclude` and entities being removed). */
    public queryColliders(sphere: Sphere, exclude?: Entity): Entity[] {
        return this._entities.queryColliders(sphere, exclude);
    }

    /**
     * Immediately removes (and disposes) the given entities, instead of at the end of the frame
     * like `shouldDispose`. Use it when something new must take their place right away.
     */
    protected remove(entities: Iterable<Entity>): void {
        const set = new Set(entities);
        this._entities.removeWhere((entity) => set.has(entity));
    }

    /**
     * Removes (and disposes) all entities matching the predicate, e.g. to reset a level. Entities
     * that are still loading are dropped as well.
     */
    protected removeEntities(predicate: (entity: Entity) => boolean): void {
        this._generation++;
        this._entities.removeWhere(predicate);
    }

    // ---- Services for entities ---------------------------------------------------------

    /** The AI's map knowledge: walkable tiles, path finding and line of sight. */
    public get navGrid(): NavGrid {
        return this._entities.navGrid;
    }

    /** Where the mouse cursor hits the ground plane. Updated once per frame. */
    public get mouseWorldPosition(): Vector3 {
        return this._mouseWorldPosition;
    }

    public shakeCamera(duration: number, intensity = 0.5): void {
        this._cameraManager.shake(duration, intensity);
    }

    public get paused(): boolean {
        return this.game.paused;
    }

    public get hud(): Hud {
        return this.game.hud;
    }

    protected get game(): Game {
        if (!this._game) throw new Error("Scene has not been loaded");
        return this._game;
    }

    // ---- Helpers for concrete scenes ---------------------------------------------------

    /** Calls `listener` when the key is pressed, for as long as this scene is loaded. */
    protected bindKey(code: string, listener: () => void): void {
        this._unsubscribers.push(InputManager.instance.onKeyDown(code, listener));
    }

    /** Adds the standard coloured lights (and their indicator spheres) around the map. */
    protected async addLights(): Promise<void> {
        const indicators = new LightingManager().setupLights(this.root, this.mapSize);
        await Promise.all(indicators.map((indicator) => this.add(indicator)));
    }

    // ---- Internals ---------------------------------------------------------------------

    private updateMouseWorldPosition(): void {
        this._raycaster.setFromCamera(InputManager.instance.mousePosition, this._cameraManager.camera);
        // Keeps the previous value if the ray doesn't hit the ground (e.g. looking at the sky)
        this._raycaster.ray.intersectPlane(this._groundPlane, this._mouseWorldPosition);
    }

    private toggleCamera = (): void => {
        const renderer = this.game.renderer;
        const next = this._cameraManager.strategy instanceof OrthographicStrategy
            ? new PerspectiveStrategy(renderer, this.mapSize)
            : new OrthographicStrategy(renderer, this.mapSize);

        this._cameraManager.setStrategy(next);
        this.hud.flash(next.pausesGame ? "Free camera (paused)" : "Top-down camera");
    };

    private toggleAiDebug = (): void => {
        this.hud.flash(this._aiDebug.toggle() ? "AI debug view on" : "AI debug view off");
    };
}

export default Scene;
