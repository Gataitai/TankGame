import { BufferGeometry, Mesh, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import type FragmentMaterials from "@/physics/FragmentMaterials";
import type { PhysicsDescription, PhysicsMode } from "@/physics/RigidBody";

/** Pieces shrink away during their last this many seconds. */
const SHRINK_TIME = 0.6;
/** Very light pieces make the simulation jittery, so every piece weighs at least this much. */
const MIN_MASS = 0.05;

/**
 * One piece of a shattered entity (made by ObjectBreaker). It's a small physics object that
 * flies off, tumbles and comes to rest on the ground or on top of other things. With a lifetime
 * it shrinks away and disappears; without one it stays.
 *
 * Pieces don't collide with each other (they start out overlapping), and have no collider, so
 * tanks and projectiles simply pass them (tanks still push them around through physics).
 */
class Fragment extends UpdatableEntity {
    private _age = 0;

    constructor(
        position: Vector3,
        private readonly _geometry: BufferGeometry,
        private readonly _materials: FragmentMaterials,
        private readonly _lifetime: number | null,
        private readonly _initialVelocity: Vector3,
        private readonly _initialSpin: Vector3,
    ) {
        super(position);
        this.blocksMovement = false;
    }

    public get defaultPhysics(): PhysicsMode {
        return "dynamic";
    }

    public async load(): Promise<void> {
        const materials = this._materials.materials;
        this.setMesh(new Mesh(this._geometry, materials.length === 1 ? materials[0] : materials));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this._materials.retain();
    }

    public onAdded(): void {
        this.rigidbody?.setVelocity(this._initialVelocity);
        this.rigidbody?.setAngularVelocity(this._initialSpin);
    }

    protected describePhysics(): PhysicsDescription {
        const description = super.describePhysics();
        return {
            ...description,
            mass: Math.max(MIN_MASS, description.mass),
            linearDamping: 0.05,
            angularDamping: 0.2,
            group: "debris",
        };
    }

    public update(deltaT: number): void {
        if (this._lifetime === null) return;

        this._age += deltaT;
        const remaining = this._lifetime - this._age;
        if (remaining <= 0) {
            this.shouldDispose = true;
        } else if (remaining < SHRINK_TIME) {
            this.mesh.scale.setScalar(remaining / SHRINK_TIME);
        }
    }

    public dispose(): void {
        super.dispose(); // Frees the geometry; the materials are shared with the other pieces
        this._materials.release();
    }
}

export default Fragment;
