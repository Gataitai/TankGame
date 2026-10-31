import { Quaternion, Vector3 } from "three";
import { Body } from "cannon-es";
import { defineComponent, type EntityId, type Tag } from "@2/ecs/Ecs";

/**
 * Where an entity is.
 *
 * For anything with a mesh these are the mesh's *own* vectors, handed over by the prefab that
 * built it (see prefabs/props.ts). Writing to a Transform therefore moves the mesh directly: one
 * source of truth, and no copying every frame to keep the two in step.
 */
export type Transform = {
    position: Vector3;
    quaternion: Quaternion;
    scale: Vector3;
};

export const Transform = defineComponent<Transform>("transform");

/** An entity taking part in the physics simulation. PhysicsSystem writes its result to Transform. */
export type PhysicsBody = {
    body: Body;
};

export const PhysicsBody = defineComponent<PhysicsBody>("physicsBody");

/**
 * A box used for area questions ("what does this blast reach?"), as half extents around the
 * entity's position. It deliberately ignores rotation: blasts are fuzzy, and skipping the matrix
 * means nothing has to be recalculated as things tumble around (see physics/AreaQuery.ts).
 */
export type AreaCollider = {
    half: Vector3;
};

export const AreaCollider = defineComponent<AreaCollider>("areaCollider");

/**
 * Travels in a straight line under its own power: a rocket, and anything else fired that takes
 * time to get there. MotionSystem sweeps a ray over each step, so it can never pass through a wall
 * however fast it flies.
 */
export type Motion = {
    /** Direction and speed in units per second. */
    velocity: Vector3;
    /** Length of `velocity`, kept around so the swept ray doesn't have to recompute it. */
    speed: number;
    /** How far ahead of itself to look for a hit. */
    radius: number;
    /** Seconds before it gives up and goes off wherever it happens to be. */
    remaining: number;
    /** Seconds between smoke puffs left behind it. 0 for no trail. */
    trailInterval: number;
    trailTimer: number;
    /** What happens when the flight ends. `hit` is null when it simply ran out of time. */
    onArrive: (entity: EntityId, hit: ArrivalHit | null) => void;
};

export type ArrivalHit = {
    point: Vector3;
    normal: Vector3;
};

export const Motion = defineComponent<Motion>("motion");

/** Never moves, so systems that only care about movement can skip it. */
export const Immovable = defineComponent<Tag>("immovable");
