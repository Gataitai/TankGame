import { Box3, Material, Mesh, Sphere, Texture, Vector3 } from "three";
import { isShared } from "@/utils/SharedResources";

abstract class Entity {
    private _mesh: Mesh = new Mesh();

    public collider?: Box3 | Sphere;

    /** Set to true to have the entity removed (and disposed) at the end of the frame. */
    public shouldDispose = false;

    /** Static entities never move, so they are indexed in a spatial grid for fast collision lookups. */
    public isStatic = false;

    /** Whether tanks are blocked by this entity's collider. */
    public blocksMovement = true;

    /** Persistent entities survive a level reset (e.g. light indicators). */
    public persistent = false;

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

    /** Replaces the root mesh while keeping the current position/rotation. */
    protected setMesh(mesh: Mesh): void {
        mesh.position.copy(this._mesh.position);
        mesh.quaternion.copy(this._mesh.quaternion);
        this._mesh = mesh;
    }

    public abstract load(): Promise<void>;

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
