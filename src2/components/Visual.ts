import { Material, Object3D, Vector3 } from "three";
import { defineComponent } from "@2/ecs/Ecs";

/**
 * What an entity looks like.
 *
 * `ownsGeometry` / `ownsMaterial` say whether this entity is the only user: shared boxes and the
 * handful of surface materials are reused by everything and must never be freed, while a piece of
 * a broken object has a geometry of its very own and an effect has its own fading material.
 */
export type Renderable = {
    object: Object3D;
    ownsGeometry?: boolean;
    ownsMaterial?: boolean;
};

export const Renderable = defineComponent<Renderable>("renderable");

/**
 * Counts down and then removes the entity. `shrink` is the tail end of that time, during which it
 * scales away to nothing, so debris doesn't blink out of existence.
 */
export type Lifetime = {
    remaining: number;
    total: number;
    shrink: number;
};

export const Lifetime = defineComponent<Lifetime>("lifetime");

/** Fades a material out as the entity's Lifetime runs down. Needs its own (owned) material. */
export type Fade = {
    material: Material & { opacity: number };
    startOpacity: number;
};

export const Fade = defineComponent<Fade>("fade");

/** One speck of an effect. Not an entity: effects own their particles directly, to keep them cheap. */
export type Particle = {
    object: Object3D;
    velocity: Vector3;
    baseScale: number;
};

/**
 * A puff of particles thrown out by an effect, animated by ParticleSystem over the entity's
 * Lifetime. Sparks shrink and slow down, smoke rises and swells, an explosion blooms outwards.
 */
export type ParticleBurst = {
    particles: Particle[];
    /** Size multiplier reached by the end of its life (below 1 shrinks, above 1 swells). */
    grow: number;
    /** Fraction of its speed a particle keeps per second (1 = keeps all of it). */
    drag: number;
};

export const ParticleBurst = defineComponent<ParticleBurst>("particleBurst");

/** Cleanup that belongs to no component in particular, run when the entity goes away. */
export type Disposable = {
    dispose: () => void;
};

export const Disposable = defineComponent<Disposable>("disposable");
