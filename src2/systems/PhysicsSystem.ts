import { Body } from "cannon-es";
import type System from "@2/ecs/System";
import { Immovable, PhysicsBody, Transform } from "@2/components/Spatial";
import { game } from "@2/scene/Game";

/**
 * Steps the simulation and writes the result back into the Transforms.
 *
 * Because a Transform holds the mesh's own vectors, writing to it moves what you see as well — so
 * this is the only place anything needs to be copied, and only for bodies that actually moved.
 * Static and sleeping bodies are skipped, which is most of the scenery.
 */
class PhysicsSystem implements System {
    public readonly name = "physics";

    public update(deltaT: number): void {
        const { ecs, physics } = game();

        physics.step(deltaT);

        ecs.each(PhysicsBody, (entity, { body }) => {
            if (body.type === Body.STATIC || body.sleepState === Body.SLEEPING) return;
            if (ecs.has(entity, Immovable)) return;

            const transform = ecs.get(entity, Transform);
            if (!transform) return;

            transform.position.set(body.position.x, body.position.y, body.position.z);
            transform.quaternion.set(
                body.quaternion.x,
                body.quaternion.y,
                body.quaternion.z,
                body.quaternion.w,
            );
        });
    }
}

export default PhysicsSystem;
