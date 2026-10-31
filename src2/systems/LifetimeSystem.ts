import type System from "@2/ecs/System";
import { Transform } from "@2/components/Spatial";
import { Fade, Lifetime } from "@2/components/Visual";
import { game } from "@2/scene/Game";

/**
 * Ages everything that is only around for a while — effects and pieces of broken things — and
 * removes it when its time is up.
 *
 * The tail end of a lifetime is where it goes away gracefully: `shrink` seconds of scaling down to
 * nothing, and a Fade on top of that for anything with a material of its own.
 */
class LifetimeSystem implements System {
    public readonly name = "lifetime";

    public update(deltaT: number): void {
        const { ecs } = game();

        ecs.each(Lifetime, (entity, lifetime) => {
            lifetime.remaining -= deltaT;

            if (lifetime.remaining <= 0) {
                ecs.destroy(entity);
                return;
            }

            const progress = 1 - lifetime.remaining / lifetime.total;

            const fade = ecs.get(entity, Fade);
            if (fade) fade.material.opacity = fade.startOpacity * (1 - progress);

            if (lifetime.shrink > 0 && lifetime.remaining < lifetime.shrink) {
                ecs.get(entity, Transform)?.scale.setScalar(lifetime.remaining / lifetime.shrink);
            }
        });
    }
}

export default LifetimeSystem;
