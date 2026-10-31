import { DirectionalLight, Light, Mesh, MeshBasicMaterial, Object3D, PointLight, Vector3 } from "three";
import type { EntityId } from "@2/ecs/Ecs";
import { Immovable, Transform } from "@2/components/Spatial";
import { Renderable } from "@2/components/Visual";
import { LightSource, Persistent } from "@2/components/Gameplay";
import { sphereGeometry } from "@2/render/Geometries";
import { game } from "@2/scene/Game";

/**
 * Lights are entities like anything else, so they are placed and freed the same way and can later
 * be made to move, flicker or follow something by giving them another component.
 *
 * They are Persistent: set up once at startup and kept when a stage is rebuilt.
 */

function createLight(position: Vector3, light: Light, marker?: Mesh): EntityId {
    const { ecs, scene } = game();

    const root = new Object3D();
    root.position.copy(position);
    root.add(light);
    if (marker) root.add(marker);
    scene.add(root);

    const entity = ecs.create();
    ecs.add(entity, Transform, {
        position: root.position,
        quaternion: root.quaternion,
        scale: root.scale,
    });
    // The marker's material is made per lamp, so this entity owns it
    ecs.add(entity, Renderable, { object: root, ownsMaterial: !!marker });
    ecs.add(entity, LightSource, { light });
    ecs.add(entity, Immovable, true);
    ecs.add(entity, Persistent, true);
    return entity;
}

export type SunOptions = {
    intensity?: number;
    /** The point it shines at. The origin by default. */
    target?: Vector3;
    /** Half the width of the square its shadow map covers, around the target. */
    shadowRadius?: number;
};

/**
 * The sun: parallel light from a fixed direction, and the only light that casts shadows. Those
 * shadows are what give the white props their shape.
 */
export function spawnSun(position: Vector3, color: number, options: SunOptions = {}): EntityId {
    const light = new DirectionalLight(color, options.intensity ?? 2.1);
    const radius = options.shadowRadius ?? 40;

    // A directional light shines from its position towards its target. The target is attached to
    // the same entity, so the light keeps its direction wherever the entity goes.
    light.target = new Object3D();
    light.target.position.copy(options.target ?? new Vector3()).sub(position);
    light.add(light.target);

    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -radius;
    light.shadow.camera.right = radius;
    light.shadow.camera.top = radius;
    light.shadow.camera.bottom = -radius;
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = radius * 6;
    light.shadow.bias = -0.0005;
    light.shadow.normalBias = 0.02;

    return createLight(position, light);
}

export type LampOptions = {
    intensity?: number;
    /** Distance at which the light has faded to nothing. */
    range?: number;
    /** Show a small glowing sphere where it is. */
    marker?: boolean;
};

/** A lamp: light falling off in every direction, with a small sphere showing where it is. */
export function spawnLamp(position: Vector3, color: number, options: LampOptions = {}): EntityId {
    const light = new PointLight(color, options.intensity ?? 30, options.range ?? 20, 2);
    const marker = (options.marker ?? true)
        ? new Mesh(sphereGeometry(0.15), new MeshBasicMaterial({ color }))
        : undefined;
    return createLight(position, light, marker);
}

/** Frees a light's shadow map. Registered as LightSource.onRemove by World. */
export function releaseLight(source: LightSource): void {
    source.light.dispose();
}
