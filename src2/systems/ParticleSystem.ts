import type System from "@2/ecs/System";
import { Lifetime, ParticleBurst } from "@2/components/Visual";
import { game } from "@2/scene/Game";

/**
 * Animates the specks inside every effect: they drift along their velocity, lose speed to drag and
 * grow or shrink as the effect's Lifetime runs down.
 *
 * The particles are plain Object3Ds owned by the effect rather than entities of their own, so a
 * burst of ten specks costs one entity and one pass here instead of ten of each.
 */
class ParticleSystem implements System {
    public readonly name = "particles";

    public update(deltaT: number): void {
        const { ecs } = game();

        ecs.each(ParticleBurst, (entity, burst) => {
            const lifetime = ecs.get(entity, Lifetime);
            if (!lifetime) return;

            const remaining = Math.max(0, lifetime.remaining / lifetime.total);
            const progress = 1 - remaining;
            const scale = 1 + (burst.grow - 1) * progress;
            const slowdown = Math.pow(burst.drag, deltaT);

            for (const particle of burst.particles) {
                particle.velocity.multiplyScalar(slowdown);
                particle.object.position.addScaledVector(particle.velocity, deltaT);
                particle.object.scale.setScalar(particle.baseScale * scale);
            }
        });
    }
}

export default ParticleSystem;
