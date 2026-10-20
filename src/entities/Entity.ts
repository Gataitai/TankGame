import { Box3, Material, Matrix4, Mesh, Sphere, Texture, Vector3 } from "three";
import { Body, Quaternion as CannonQuaternion, Vec3 } from "cannon-es";
import { isShared } from "@/utils/SharedResources";

export type BodyOptions = NonNullable<ConstructorParameters<typeof Body>[0]>;

/** Where (and how hard) an entity was hit when it was destroyed. */
export type Impact = {
    point: Vector3;
    /** Speed at which the pieces fly away from the point. */
    force: number;
};

const _matrix = new Matrix4();

/**
 * Base class of everything in the game.
 *
 * Physics is part of every entity: an entity may have a cannon-es `body`.
 * - A static body (mass 0) never moves; other things just collide with it (walls, the ground).
 * - A dynamic body is simulated. After every physics step its mesh and collider are moved to where
 *   the body ended up, so physics drives the entity (crates, balls, pieces of broken things).
 * The EntityManager adds the body to the physics world when the entity is spawned and removes it
 * again when the entity is disposed.
 *
 * Colliders (`collider`) are separate, simple shapes used for game logic: projectile hits, blast
 * radiuses and the AI's movement checks. They follow the body automatically.
 *
 * Destructible entities break into pieces made from their own mesh when destroyed: see destroy().
 */
abstract class Entity {
    private _mesh: Mesh = new Mesh();

    public collider?: Box3 | Sphere;

    /** Physics body, if the entity takes part in the physics simulation. Created in load(). */
    public body: Body | null = null;

    /** Set to true to have the entity removed (and disposed) at the end of the frame. */
    public shouldDispose = false;

    /** Static entities never move, so they are indexed in a spatial grid for fast collision lookups. */
    public isStatic = false;

    /** Whether tanks are blocked by this entity's collider. */
    public blocksMovement = true;

    /** Persistent entities survive a level reset (e.g. light indicators). */
    public persistent = false;

    /** Missiles, mines and explosions destroy this entity, breaking it into pieces. */
    public destructible = false;

    /** Even a single bullet destroys it (only used when destructible). */
    public fragile = false;

    /** How many pieces each of its meshes breaks into. Picked from the mesh's size when not set. */
    public shardCount?: number;

    /** Set by destroy(). The entity is broken into pieces when it's removed at the end of the frame. */
    public impact: Impact | null = null;

    /** The collider relative to the entity, so it can follow the entity when physics moves it. */
    private _localCollider: Box3 | Sphere | null = null;

    constructor(position: Vector3) {
        this._mesh.position.copy(position);
    }

    /** The entity's position. This is the mesh position, so there is a single source of truth. */
    public get position(): Vector3 {
        return this._mesh.position;
    }

    public get mesh(): Mesh {
        return this._mesh;
    }

    /** Whether the entity has a body that's moved by the physics simulation. */
    public get isDynamic(): boolean {
        return this.body?.type === Body.DYNAMIC;
    }

    /** Replaces the root mesh while keeping the current position/rotation. */
    protected setMesh(mesh: Mesh): void {
        mesh.position.copy(this._mesh.position);
        mesh.quaternion.copy(this._mesh.quaternion);
        this._mesh = mesh;
    }

    public abstract load(): Promise<void>;

    // ---- Physics -------------------------------------------------------------------------

    /**
     * Creates the entity's physics body at the mesh's current position and rotation.
     * Add shapes to the returned body. A mass of 0 (the default) makes a static body.
     */
    protected createBody(options: BodyOptions): Body {
        const { x, y, z } = this._mesh.position;
        const q = this._mesh.quaternion;
        this.body = new Body({
            ...options,
            position: new Vec3(x, y, z),
            quaternion: new CannonQuaternion(q.x, q.y, q.z, q.w),
        });
        return this.body;
    }

    /** Called once per frame, right before the physics step. Override to drive the body (tanks do). */
    public beforePhysicsStep(_deltaT: number): void {}

    /** Called once per frame after the physics step: moves the mesh and collider to the body. */
    public afterPhysicsStep(_deltaT: number): void {
        const body = this.body;
        if (!body || body.type === Body.STATIC || body.sleepState === Body.SLEEPING) return;

        this._mesh.position.set(body.position.x, body.position.y, body.position.z);
        this._mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
        this.updateCollider();
    }

    // ---- Collider ------------------------------------------------------------------------

    /** Whether the entity's collider touches the sphere. Override for shapes a box fits badly (ramps). */
    public intersectsSphere(sphere: Sphere): boolean {
        return !!this.collider?.intersectsSphere(sphere);
    }

    /** Remembers the collider relative to the entity. Called by the EntityManager when it's added. */
    public captureColliderOffset(): void {
        if (!this.collider) return;
        this._localCollider = this.collider.clone().applyMatrix4(this.worldMatrix().invert());
    }

    /** Moves the collider along with the entity (after physics moved or rotated it). */
    public updateCollider(): void {
        if (!this.collider || !this._localCollider) return;

        const matrix = this.worldMatrix();
        if (this.collider instanceof Sphere) {
            this.collider.copy(this._localCollider as Sphere).applyMatrix4(matrix);
        } else {
            this.collider.copy(this._localCollider as Box3).applyMatrix4(matrix);
        }
    }

    private worldMatrix(): Matrix4 {
        return _matrix.compose(this._mesh.position, this._mesh.quaternion, this._mesh.scale);
    }

    // ---- Destruction ---------------------------------------------------------------------

    /**
     * Destroys the entity: it's removed at the end of the frame and its meshes break into pieces
     * (with the original textures) that fly away from `point` at about `force` units per second and
     * then fall to the ground. Safe to call more than once.
     */
    public destroy(point: Vector3 = this.position, force = 3): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;
        this.impact = { point: point.clone(), force };
        this.onDestroyed(this.impact);
    }

    /** Hook for extra effects when destroyed (explosions, scorch marks...). */
    protected onDestroyed(_impact: Impact): void {}

    // ---- Cleanup -------------------------------------------------------------------------

    /**
     * Frees GPU resources owned by this entity and detaches it from the scene.
     * Shared resources (see SharedResources.ts) are left alone.
     */
    public dispose(): void {
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
