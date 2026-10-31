import { Mesh, MeshStandardMaterial, Vector3 } from "three";
import type { EntityId } from "@2/ecs/Ecs";
import { Motion, Transform, type ArrivalHit } from "@2/components/Spatial";
import { Renderable } from "@2/components/Visual";
import { ROCKET_GEOMETRY } from "@2/render/Geometries";
import { Palette } from "@2/render/Materials";
import { entitiesInSphere } from "@2/physics/AreaQuery";
import { game } from "@2/scene/Game";
import { breakEntity } from "@2/systems/BreakSystem";
import { spawnExplosion, spawnSmoke } from "@2/prefabs/effects";
import { HIT_SHAKE } from "@2/config";

const SPEED = 24;
const LIFETIME = 6;
const RADIUS = 0.08;
const TRAIL_INTERVAL = 0.03;

/** Breakable things within this distance of the blast come apart. */
const BLAST_RADIUS = 3;
/** Loose objects further away are still thrown around by the blast. */
const PUSH_RADIUS = 5.5;
const PUSH_STRENGTH = 16;
/** How fast the pieces of the things it destroys fly apart. */
const BREAK_FORCE = 7;
/** Keeps the explosion from sinking into the surface it went off against. */
const SURFACE_OFFSET = 0.15;

/** The rocket's own material: emissive so it reads as hot against the white scenery. */
const ROCKET_MATERIAL = new MeshStandardMaterial({
    color: Palette.red,
    emissive: 0x7a1c0c,
    emissiveIntensity: 0.8,
    roughness: 0.4,
});

/**
 * Flies from the launcher to whatever it runs into and explodes there: breaking everything
 * breakable nearby, throwing loose things around and shaking the camera.
 */
export function spawnRocket(position: Vector3, direction: Vector3): EntityId {
    const { ecs, scene } = game();

    const mesh = new Mesh(ROCKET_GEOMETRY, ROCKET_MATERIAL);
    mesh.position.copy(position);
    mesh.castShadow = true;
    scene.add(mesh);

    const entity = ecs.create();
    ecs.add(entity, Transform, {
        position: mesh.position,
        quaternion: mesh.quaternion,
        scale: mesh.scale,
    });
    ecs.add(entity, Renderable, { object: mesh });
    ecs.add(entity, Motion, {
        velocity: direction.clone().normalize().multiplyScalar(SPEED),
        speed: SPEED,
        radius: RADIUS,
        remaining: LIFETIME,
        trailInterval: TRAIL_INTERVAL,
        trailTimer: 0,
        onArrive: detonate,
    });
    return entity;
}

function detonate(entity: EntityId, hit: ArrivalHit | null): void {
    const { ecs, physics, camera } = game();

    const at = ecs.require(entity, Transform).position.clone();
    if (hit) at.addScaledVector(hit.normal, SURFACE_OFFSET);
    ecs.destroy(entity);

    for (const other of entitiesInSphere(at, BLAST_RADIUS, entity)) {
        breakEntity(other, at, BREAK_FORCE);
    }
    physics.explode(at, PUSH_RADIUS, PUSH_STRENGTH);

    spawnExplosion(at, 2.2);
    spawnSmoke(at, 3, 1.6);
    camera.shake(HIT_SHAKE.duration, HIT_SHAKE.intensity);
}
