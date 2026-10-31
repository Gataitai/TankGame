import { Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, Vector3 } from "three";
import type { EntityId } from "@2/ecs/Ecs";
import { Transform } from "@2/components/Spatial";
import { Fade, Lifetime, ParticleBurst, Renderable, type Particle } from "@2/components/Visual";
import { BEAM_GEOMETRY, PARTICLE_GEOMETRY } from "@2/render/Geometries";
import { game } from "@2/scene/Game";
import { randomConeDirection, randomInRange, randomIntInRange, randomUnitVector } from "@2/utils/MathUtils";

/**
 * Short-lived visual flourishes. Each one is a single entity holding a group of particles, which
 * ParticleSystem animates over the entity's Lifetime — the particles are not entities themselves,
 * so a burst of ten specks costs one entity instead of ten.
 *
 * Effects own their material (they fade it), so Renderable.ownsMaterial is set and the geometry is
 * always one of the shared ones.
 */

type EffectOptions = {
    duration: number;
    grow: number;
    drag: number;
};

function createEffect(
    position: Vector3,
    particles: Particle[],
    root: Object3D,
    material: (MeshStandardMaterial | MeshBasicMaterial) & { opacity: number },
    options: EffectOptions,
): EntityId {
    const { ecs, scene } = game();

    root.position.copy(position);
    scene.add(root);

    const entity = ecs.create();
    ecs.add(entity, Transform, {
        position: root.position,
        quaternion: root.quaternion,
        scale: root.scale,
    });
    ecs.add(entity, Renderable, { object: root, ownsMaterial: true });
    ecs.add(entity, Lifetime, { remaining: options.duration, total: options.duration, shrink: 0 });
    ecs.add(entity, Fade, { material, startOpacity: material.opacity });
    if (particles.length > 0) {
        ecs.add(entity, ParticleBurst, { particles, grow: options.grow, drag: options.drag });
    }
    return entity;
}

/** Builds `count` specks sharing one material, scattered around the root. */
function burst(
    root: Object3D,
    material: MeshStandardMaterial | MeshBasicMaterial,
    count: number,
    scale: number,
    velocity: () => Vector3,
    jitter = 0,
): Particle[] {
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
        const object = new Mesh(PARTICLE_GEOMETRY, material);
        object.scale.setScalar(scale);
        if (jitter > 0) object.position.copy(randomUnitVector()).multiplyScalar(Math.random() * jitter);
        root.add(object);
        particles.push({ object, velocity: velocity(), baseScale: scale });
    }
    return particles;
}

// ---- Sparks -----------------------------------------------------------------------------

const SPARK_SPREAD = Math.PI * 0.35;

/** A burst of sparks in a cone: at the muzzle when a weapon fires, and where a shot lands. */
export function spawnSparks(position: Vector3, direction: Vector3, scale = 1): EntityId {
    const material = new MeshBasicMaterial({ color: 0xffc247, transparent: true, opacity: 0.95 });
    const aim = direction.clone().normalize();
    const root = new Object3D();
    const particles = burst(root, material, randomIntInRange(5, 9), 0.025 * scale, () =>
        randomConeDirection(aim, SPARK_SPREAD).multiplyScalar(randomInRange(2, 7)));

    return createEffect(position, particles, root, material, { duration: 0.18, grow: 0, drag: 0.02 });
}

// ---- Smoke ------------------------------------------------------------------------------

/** A puff of smoke drifting up and spreading out. */
export function spawnSmoke(position: Vector3, scale = 1, duration = 0.9): EntityId {
    const material = new MeshStandardMaterial({
        color: 0xdcdcdc,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        roughness: 1,
    });
    const root = new Object3D();
    const particles = burst(root, material, randomIntInRange(3, 6), 0.08 * scale, () =>
        randomUnitVector().multiplyScalar(randomInRange(0.1, 0.5)).setZ(randomInRange(0.5, 1.2)),
        0.08 * scale);

    return createEffect(position, particles, root, material, { duration, grow: 2.6, drag: 0.3 });
}

// ---- Trail ------------------------------------------------------------------------------

/** One puff left behind by a rocket; a stream of them makes the trail. */
export function spawnTrail(position: Vector3, duration = 0.6): EntityId {
    const material = new MeshStandardMaterial({
        color: 0xf0f0f0,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
        roughness: 1,
    });
    const root = new Object3D();
    const particles = burst(root, material, 1, 0.07, () => new Vector3(), 0.05);

    return createEffect(position, particles, root, material, { duration, grow: 2.6, drag: 1 });
}

// ---- Explosion --------------------------------------------------------------------------

/** A ball of debris blooming outwards and fading. `size` is roughly its radius in tiles. */
export function spawnExplosion(position: Vector3, size: number): EntityId {
    const material = new MeshStandardMaterial({
        color: 0xfff3e0,
        emissive: 0xff7a1a,
        emissiveIntensity: 0.7,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        roughness: 1,
    });
    const root = new Object3D();
    const particles: Particle[] = [];
    const count = randomIntInRange(8, 13);
    for (let i = 0; i < count; i++) {
        const scale = size * randomInRange(0.15, 0.35);
        const object = new Mesh(PARTICLE_GEOMETRY, material);
        object.scale.setScalar(scale);
        object.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        root.add(object);
        particles.push({
            object,
            velocity: randomUnitVector().multiplyScalar(randomInRange(0.5, 3) * size),
            baseScale: scale,
        });
    }

    return createEffect(position, particles, root, material, { duration: 0.5, grow: 0.2, drag: 0.15 });
}

// ---- Tracer -----------------------------------------------------------------------------

const TRACER_RADIUS = 0.012;
const MODEL_FORWARD = new Vector3(0, 1, 0);
const _direction = new Vector3();

/**
 * The streak a hitscan shot leaves between the muzzle and what it hit. It lives for a couple of
 * frames, which is what makes an instant hit readable.
 */
export function spawnTracer(from: Vector3, to: Vector3): EntityId | null {
    _direction.subVectors(to, from);
    const length = _direction.length();
    if (length < 1e-4) return null;

    const material = new MeshBasicMaterial({
        color: 0xffe9a8,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
    });
    const beam = new Mesh(BEAM_GEOMETRY, material);
    beam.quaternion.setFromUnitVectors(MODEL_FORWARD, _direction.divideScalar(length));
    beam.scale.set(TRACER_RADIUS, length, TRACER_RADIUS);

    return createEffect(from, [], beam, material, { duration: 0.05, grow: 1, drag: 1 });
}
