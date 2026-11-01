import { Mesh, Object3D, Vector3 } from "three";
import type System from "@2/ecs/System";
import type { EntityId } from "@2/ecs/Ecs";
import { PhysicsBody, Transform } from "@2/components/Spatial";
import { Renderable } from "@2/components/Visual";
import { Breakable } from "@2/components/Gameplay";
import { fractureMesh } from "@2/physics/Fracture";
import { spawnDebris } from "@2/prefabs/debris";
import { debrisRoom, trimDebris } from "@2/systems/DebrisSystem";
import { releaseRenderable } from "@2/prefabs/props";
import { game } from "@2/scene/Game";
import { BREAK_BUDGET_MS, MAX_BREAK_QUEUE } from "@2/config";

const MAX_SPIN = 8;

/**
 * Pieces a thing leaves behind even when the pile is already full.
 *
 * Something always has to come out of a block, or it would appear to evaporate. The surplus is
 * covered by retiring the oldest rubble instead (see trimDebris).
 */
const MIN_PIECES = 3;

/** One object waiting to be cut up. It owns `object` until the job has run. */
type BreakJob = {
    object: Object3D;
    /** Where it was hit, and how fast the pieces should fly away from there. */
    impact: Vector3;
    force: number;
    /** Speed the object already had, which its pieces inherit. */
    inherited: Vector3;
    pieces: number;
};

const queue: BreakJob[] = [];

/**
 * Destroys an entity, and if it can break, lines it up to be cut into pieces.
 *
 * The entity leaves the world straight away, but the cutting happens later, within the frame
 * budget BreakSystem is given. That is the whole point: a mesh has to be read triangle by
 * triangle, split by a plane for every piece, and each piece needs a geometry and a physics body
 * of its own. Doing that for a dozen objects caught in the same explosion is far more than one
 * frame's worth of work, so it is spread over the next few instead.
 *
 * The pieces are not themselves breakable, so this only ever happens once per object: shooting the
 * rubble afterwards knocks it around instead of splitting it again.
 */
export function breakEntity(entity: EntityId, impact: Vector3, force = 3): void {
    const { ecs } = game();
    if (!ecs.isAlive(entity) || ecs.isDoomed(entity)) return;

    const breakable = ecs.get(entity, Breakable);
    if (!breakable) return;

    // It's gone either way; only whether it leaves pieces behind is in question
    ecs.destroy(entity);

    // The queue is already swamped: it just disappears without leaving anything
    if (queue.length >= MAX_BREAK_QUEUE) return;

    const transform = ecs.get(entity, Transform);
    // take() hands the mesh over without freeing it, so the job can still cut it up
    const renderable = ecs.take(entity, Renderable);
    if (!transform || !renderable) return;

    const object = renderable.object;
    object.removeFromParent();
    object.position.copy(transform.position);
    object.quaternion.copy(transform.quaternion);
    object.scale.copy(transform.scale);

    const body = ecs.get(entity, PhysicsBody)?.body;
    queue.push({
        object,
        impact: impact.clone(),
        force,
        inherited: body
            ? new Vector3(body.velocity.x, body.velocity.y, body.velocity.z)
            : new Vector3(),
        pieces: breakable.pieces,
    });
}

/** How many objects are still waiting to come apart. Shown in the debug readout. */
export function breakQueueLength(): number {
    return queue.length;
}

/**
 * Cuts queued objects into pieces, a few milliseconds' worth per frame.
 *
 * At least one object is always finished per frame, so the queue can never stall completely; the
 * budget only decides how many more get done before the frame has to be handed back.
 */
class BreakSystem implements System {
    public readonly name = "break";

    public update(_deltaT: number): void {
        if (queue.length === 0) return;

        const deadline = performance.now() + BREAK_BUDGET_MS;
        do {
            this.run(queue.shift()!);
        } while (queue.length > 0 && performance.now() < deadline);
    }

    /** Drops everything still queued, freeing the meshes the jobs were holding. */
    public reset(): void {
        for (const job of queue) releaseRenderable({ object: job.object, ownsGeometry: true });
        queue.length = 0;
    }

    private run(job: BreakJob): void {
        const meshes: Mesh[] = [];
        job.object.updateWorldMatrix(false, true);
        job.object.traverse((child) => {
            const mesh = child as Mesh;
            if (mesh.isMesh && mesh.visible && mesh.geometry?.getAttribute("position")) meshes.push(mesh);
        });

        // Cut no more pieces than there is room for. Making the full ten and letting the cap
        // retire seven of them straight away is what made rubble flicker out of existence just
        // after an explosion; a full pile now yields fewer, chunkier pieces that actually stay.
        const pieces = Math.max(MIN_PIECES, Math.min(job.pieces, debrisRoom()));

        const away = new Vector3();
        for (const mesh of meshes) {
            for (const fragment of fractureMesh(mesh, pieces, job.impact)) {
                // Away from the impact (and a bit upwards), on top of the speed it already had
                away.copy(fragment.center).sub(job.impact);
                away.z = Math.max(away.z, 0) + 0.3;
                away.normalize().multiplyScalar(job.force * (0.5 + Math.random()));
                away.add(job.inherited);

                const spin = new Vector3(randomSpin(), randomSpin(), randomSpin());
                spawnDebris(fragment, away, spin);
            }
        }

        // The pieces carry their own fresh geometries now, and the material was always shared
        releaseRenderable({ object: job.object, ownsGeometry: true });

        // Retire the oldest rubble now rather than next frame, so the room this job's successors
        // see is up to date
        trimDebris();
    }
}

function randomSpin(): number {
    return (Math.random() * 2 - 1) * MAX_SPIN;
}

export default BreakSystem;
