import { Box3, Mesh, Vector3 } from "three";
import { Box, Vec3 } from "cannon-es";
import UpdatableEntity from "@/entities/UpdatableEntity";
import type { Fragment } from "@/physics/Fracture";
import { CollisionGroups, PhysicsMaterials } from "@/physics/PhysicsWorld";
import { MAX_SHARDS, SHARD_LIFETIME } from "@/config";

const FADE_TIME = 0.6;
const LIFETIME_JITTER = 2;
/** Mass per unit of (bounding box) volume. */
const DENSITY = 0.5;
const MIN_MASS = 0.02;
/** The physics box is a bit smaller than the piece's bounding box, which is never filled completely. */
const BOX_FIT = 0.8;
const MIN_HALF_EXTENT = 0.02;

/** Every live shard, oldest first, to cap how many exist at once. */
const activeShards: Shard[] = [];

/**
 * A piece of a destroyed entity, made from the entity's own mesh (see Fracture.ts). It's thrown
 * away from the impact, tumbles to the ground and later shrinks away.
 *
 * Shards have a physics body (so they bounce off walls, pile up and get pushed around by tanks) but
 * no collider: projectiles fly over them and the AI ignores them.
 */
class Shard extends UpdatableEntity {
    private readonly _fragment: Fragment;
    private readonly _velocity: Vector3;
    private readonly _spin: Vector3;
    private readonly _lifetime = SHARD_LIFETIME + (Math.random() - 0.5) * LIFETIME_JITTER;
    private _age = 0;

    constructor(fragment: Fragment, velocity: Vector3, spin: Vector3) {
        super(fragment.center);
        this._fragment = fragment;
        this._velocity = velocity;
        this._spin = spin;
        this.blocksMovement = false;
    }

    public async load(): Promise<void> {
        this.build();
    }

    /** Synchronous part of load(), so shards can replace a destroyed entity within the same frame. */
    public build(): void {
        this.setMesh(new Mesh(this._fragment.geometry, this._fragment.material));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const size = this._fragment.size;
        const half = new Vec3(
            Math.max(MIN_HALF_EXTENT, (size.x / 2) * BOX_FIT),
            Math.max(MIN_HALF_EXTENT, (size.y / 2) * BOX_FIT),
            Math.max(MIN_HALF_EXTENT, (size.z / 2) * BOX_FIT),
        );
        // Box3 of the actual geometry keeps the body centred on the visible piece
        const bounds = this._fragment.geometry.boundingBox ?? new Box3();
        const offset = bounds.getCenter(new Vector3());

        const body = this.createBody({
            mass: Math.max(MIN_MASS, size.x * size.y * size.z * DENSITY),
            material: PhysicsMaterials.shard,
            collisionFilterGroup: CollisionGroups.shard,
            linearDamping: 0.05,
            angularDamping: 0.3,
            sleepSpeedLimit: 0.2,
        });
        body.addShape(new Box(half), new Vec3(offset.x, offset.y, offset.z));
        body.velocity.set(this._velocity.x, this._velocity.y, this._velocity.z);
        body.angularVelocity.set(this._spin.x, this._spin.y, this._spin.z);

        activeShards.push(this);
        const excess = activeShards.length - MAX_SHARDS;
        for (let i = 0; i < excess; i++) activeShards[i].expire();
    }

    public update(deltaT: number): void {
        this._age += deltaT;
        const fade = (this._age - this._lifetime) / FADE_TIME;
        if (fade <= 0) return;

        if (fade >= 1) {
            this.shouldDispose = true;
            return;
        }
        this.mesh.scale.setScalar(1 - fade);
    }

    /** Starts shrinking away now. */
    public expire(): void {
        this._age = Math.max(this._age, this._lifetime);
    }

    public dispose(): void {
        super.dispose();
        const index = activeShards.indexOf(this);
        if (index >= 0) activeShards.splice(index, 1);
    }
}

export default Shard;
