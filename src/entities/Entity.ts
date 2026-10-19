import { Box3, Material, Matrix4, Mesh, Object3D, Sphere, Texture, Vector3 } from "three";
import { Box as BoxShape, Vec3 } from "cannon-es";
import { isShared } from "@/utils/SharedResources";
import type Scene from "@/scene/Scene";
import type RigidBody from "@/physics/RigidBody";
import type { PhysicsDescription, PhysicsMode } from "@/physics/RigidBody";
import type { BreakSettings, Impact } from "@/physics/ObjectBreaker";

/** Physics bodies are never thinner than this (very thin bodies fall through things). */
const MIN_BODY_SIZE = 0.06;

/**
 * Base class for everything that lives in a scene (like a GameObject in Unity).
 *
 * Lifecycle: create it, then `scene.add(entity)`. The scene sets `entity.scene`, calls `load()`
 * (build meshes/colliders), gives it a physics body if wanted, calls `onAdded()`, then updates it
 * every frame (UpdatableEntity) until `shouldDispose` is set, after which the scene calls `dispose()`.
 *
 * Physics: every entity can have a physics body (`rigidbody`), chosen when it's added
 * (`scene.add(entity, { physics: "static" | "dynamic" | "none" })`, or the class's
 * `defaultPhysics`) and switchable at any time with `setPhysics()`. The body's shape comes from
 * `describePhysics()`, which by default is a box around the mesh.
 *
 * Breaking: entities with `breakSettings` can be shattered into physics pieces with `break()`.
 */
abstract class Entity {
    private _mesh: Mesh = new Mesh();
    private _scene: Scene | null = null;
    private _rigidbody: RigidBody | null = null;
    /** Offset of a sphere collider's centre from the entity position, kept when physics moves it. */
    private _colliderOffset: Vector3 | null = null;

    /** How this entity shatters (see ObjectBreaker); null if it can't break. */
    public breakSettings: BreakSettings | null = null;

    public collider?: Box3 | Sphere;

    /** Set to true to have the entity removed (and disposed) at the end of the frame. */
    public shouldDispose = false;

    /** Static entities never move, so they are indexed in a spatial grid for fast collision lookups. */
    public isStatic = false;

    /** Whether tanks are blocked by this entity's collider (also used for the AI's map grid). */
    public blocksMovement = true;

    /** Persistent entities survive a level reset (e.g. light indicators). */
    public persistent = false;

    constructor(position: Vector3) {
        this._mesh.position.copy(position);
    }

    /**
     * The scene this entity belongs to (like `gameObject.scene` in Unity). Use it to spawn other
     * entities, find entities or query collisions. Available from `load()` onwards.
     */
    public get scene(): Scene {
        if (!this._scene) throw new Error(`${this.constructor.name} has not been added to a scene`);
        return this._scene;
    }

    /** Called by Scene.add() before load(). */
    public attachToScene(scene: Scene): void {
        this._scene = scene;
    }

    /** The entity's position. This is the mesh position, so there is a single source of truth. */
    public get position(): Vector3 {
        return this._mesh.position;
    }

    public get mesh(): Mesh {
        return this._mesh;
    }

    /** Replaces the root mesh while keeping the current position/rotation. */
    protected setMesh(mesh: Mesh): void {
        mesh.position.copy(this._mesh.position);
        mesh.quaternion.copy(this._mesh.quaternion);
        this._mesh = mesh;
    }

    public abstract load(): Promise<void>;

    /** Called once the entity is fully in the scene (loaded, with its physics body if any). */
    public onAdded(): void {}

    // ---- Physics -----------------------------------------------------------------------

    /** Physics used when the entity is added without choosing (see Scene.add). */
    public get defaultPhysics(): PhysicsMode {
        return "none";
    }

    /** The entity's physics body, or null when it has no physics. */
    public get rigidbody(): RigidBody | null {
        return this._rigidbody;
    }

    public get physicsMode(): PhysicsMode {
        return this._rigidbody?.mode ?? "none";
    }

    /**
     * Gives the entity a static or dynamic physics body, or removes it ("none"). Can be called at
     * any time, e.g. to make a wall suddenly fall over.
     */
    public setPhysics(mode: PhysicsMode): void {
        if (mode === this.physicsMode) return;

        if (this._rigidbody) {
            this.scene.physics.removeRigidBody(this._rigidbody);
            this._rigidbody = null;
        }
        if (mode === "none") return;

        // Something that can move is no longer part of the static collision grid / the AI's map
        if (mode === "dynamic" && this.isStatic) {
            this.scene.reindex(this, () => (this.isStatic = false));
        }

        this._rigidbody = this.scene.physics.createRigidBody(this, mode, this.describePhysics());
        this._colliderOffset = this.collider instanceof Sphere ? this.collider.center.clone().sub(this.position) : null;
    }

    /**
     * The shape, mass and surface of this entity's physics body. By default a box around the
     * mesh with a mass equal to its volume; override (or adjust `super.describePhysics()`) for
     * other shapes or settings.
     */
    protected describePhysics(): PhysicsDescription {
        const bounds = this.localBounds(this.mesh);
        const size = bounds.getSize(new Vector3()).max(new Vector3(MIN_BODY_SIZE, MIN_BODY_SIZE, MIN_BODY_SIZE));
        return {
            shape: new BoxShape(new Vec3(size.x / 2, size.y / 2, size.z / 2)),
            offset: bounds.getCenter(new Vector3()),
            mass: size.x * size.y * size.z,
            surface: "default",
            fixedRotation: false,
            linearDamping: 0.01,
            angularDamping: 0.01,
            group: "default",
        };
    }

    /** Called by the physics world after each step: moves the entity to where its body is. */
    public syncFromPhysics(): void {
        const rigidbody = this._rigidbody;
        if (!rigidbody) return;

        const { position, quaternion } = rigidbody.body;
        this.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
        const offset = rigidbody.offset.clone().applyQuaternion(this.mesh.quaternion);
        this.position.set(position.x - offset.x, position.y - offset.y, position.z - offset.z);
        this.onPhysicsMoved();
    }

    /** Keeps the collider with the entity after physics moved it. */
    protected onPhysicsMoved(): void {
        if (this.collider instanceof Sphere && this._colliderOffset) {
            this.collider.center.copy(this.position).add(this._colliderOffset);
        } else if (this.collider instanceof Box3) {
            this.collider.setFromObject(this.mesh);
        }
    }

    /** Bounding box of `object` in this entity's own coordinate system (ignoring its position/rotation). */
    protected localBounds(object: Object3D): Box3 {
        this.mesh.updateMatrixWorld(true);
        const toLocal = new Matrix4().copy(this.mesh.matrixWorld).invert();
        const bounds = new Box3();
        object.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh || !mesh.geometry) return;
            if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
            const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld).applyMatrix4(toLocal);
            bounds.union(box);
        });
        return bounds;
    }

    // ---- Breaking ----------------------------------------------------------------------

    /**
     * Shatters the entity into pieces (see ObjectBreaker) and removes it. Does nothing if it has
     * no breakSettings or is already being removed.
     */
    public break(impact?: Impact): void {
        if (!this.breakSettings || this.shouldDispose) return;
        this.scene.breaker.shatter(this, this.breakSettings, impact);
        this.shouldDispose = true;
    }

    /**
     * Precise overlap test used by collision queries (projectile hits, tank movement). By default
     * the collider itself; entities whose collider is only a rough bound (e.g. a rotated box)
     * override this with an exact test.
     */
    public intersectsSphere(sphere: Sphere): boolean {
        return this.collider !== undefined && this.collider.intersectsSphere(sphere);
    }

    /**
     * Whether `mover` (a tank) may not move by `movement` into this entity. Dynamic physics
     * bodies don't block: the tank pushes them and the physics simulation sorts it out.
     */
    public blocks(_mover: Entity, _movement: Vector3): boolean {
        return this.blocksMovement && !this._rigidbody?.isDynamic;
    }

    /**
     * Frees GPU resources owned by this entity and detaches it from the scene.
     * Shared resources (see SharedResources.ts) are left alone.
     */
    public dispose(): void {
        if (this._rigidbody) {
            this.scene.physics.removeRigidBody(this._rigidbody);
            this._rigidbody = null;
        }

        this._mesh.traverse((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;

            if (mesh.geometry && !isShared(mesh.geometry)) {
                mesh.geometry.dispose();
            }

            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => this.disposeMaterial(material));
        });

        this._mesh.removeFromParent();
        this._mesh.clear();
    }

    private disposeMaterial(material: Material | undefined): void {
        if (!material || isShared(material)) return;

        // Dispose every texture slot (map, normalMap, ...) that isn't shared.
        for (const value of Object.values(material)) {
            if (value instanceof Texture && !isShared(value)) {
                value.dispose();
            }
        }
        material.dispose();
    }
}

export default Entity;
