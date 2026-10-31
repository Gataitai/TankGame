import { Vector3 } from "three";
import type System from "@2/ecs/System";
import { Motion, Transform } from "@2/components/Spatial";
import { PROJECTILE_MASK } from "@2/physics/PhysicsWorld";
import { spawnTrail } from "@2/prefabs/effects";
import { game } from "@2/scene/Game";

/** The projectile model points along +Y. */
const MODEL_FORWARD = new Vector3(0, 1, 0);
const _direction = new Vector3();

/**
 * Flies everything with Motion: a swept ray over the step it is about to take, so a projectile can
 * never tunnel through a wall however fast it goes, and the smoke trail behind it.
 *
 * When the flight ends the motion's own onArrive decides what that means — see prefabs/rocket.ts,
 * which explodes. This system has no idea what it is flying.
 */
class MotionSystem implements System {
    public readonly name = "motion";

    public update(deltaT: number): void {
        const { ecs, physics } = game();

        ecs.each(Motion, (entity, motion) => {
            if (ecs.isDoomed(entity)) return;

            const transform = ecs.get(entity, Transform);
            if (!transform) return;
            const position = transform.position;

            motion.remaining -= deltaT;
            if (motion.remaining <= 0) {
                motion.onArrive(entity, null);
                return;
            }

            if (motion.trailInterval > 0) {
                motion.trailTimer -= deltaT;
                if (motion.trailTimer <= 0) {
                    motion.trailTimer = motion.trailInterval;
                    spawnTrail(position);
                }
            }

            // Look one step ahead rather than moving first and checking afterwards
            const step = motion.speed * deltaT + motion.radius;
            const hit = physics.raycast(position, motion.velocity, step, PROJECTILE_MASK);
            if (hit) {
                position.copy(hit.point);
                motion.onArrive(entity, { point: hit.point, normal: hit.normal });
                return;
            }

            position.addScaledVector(motion.velocity, deltaT);
            if (motion.speed > 0) {
                _direction.copy(motion.velocity).divideScalar(motion.speed);
                transform.quaternion.setFromUnitVectors(MODEL_FORWARD, _direction);
            }
        });
    }
}

export default MotionSystem;
