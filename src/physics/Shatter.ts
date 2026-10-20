import { Box3, Material, Mesh, Vector3 } from "three";
import type Entity from "@/entities/Entity";
import Shard from "@/entities/Shard";
import { fractureMesh } from "@/physics/Fracture";
import { isShared, markShared } from "@/utils/SharedResources";

const MIN_PIECES = 4;
const MAX_PIECES = 14;
/** Extra pieces per unit of volume. */
const PIECES_PER_VOLUME = 10;
const MAX_SPIN = 8;

/**
 * Breaks a destroyed entity (see Entity.destroy) into shards made from its meshes. Every mesh of
 * the entity is broken separately (e.g. a tank's body and turret), keeping its material and texture.
 */
export function shatter(entity: Entity): Shard[] {
    const impact = entity.impact;
    if (!impact) return [];

    const inherited = entity.body
        ? new Vector3(entity.body.velocity.x, entity.body.velocity.y, entity.body.velocity.z)
        : new Vector3();

    const meshes: Mesh[] = [];
    entity.mesh.updateWorldMatrix(true, true);
    entity.mesh.traverse((object) => {
        const mesh = object as Mesh;
        if (mesh.isMesh && mesh.visible && mesh.geometry?.getAttribute("position")) meshes.push(mesh);
    });

    const shards: Shard[] = [];
    for (const mesh of meshes) {
        const count = entity.shardCount ?? piecesFor(mesh);
        const material = sharedMaterial(mesh.material);
        for (const fragment of fractureMesh(mesh, count, impact.point)) {
            fragment.material = material;

            // Away from the impact (and a bit upwards), on top of the speed the entity already had
            const away = fragment.center.clone().sub(impact.point);
            away.z = Math.max(away.z, 0) + 0.3;
            away.normalize().multiplyScalar(impact.force * (0.5 + Math.random()));
            const spin = new Vector3(randomSpin(), randomSpin(), randomSpin());

            shards.push(new Shard(fragment, away.add(inherited), spin));
        }
    }
    return shards;
}

/** Bigger meshes break into more pieces. */
function piecesFor(mesh: Mesh): number {
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const size = new Box3().copy(geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).getSize(new Vector3());
    const volume = size.x * size.y * size.z;
    return Math.min(MAX_PIECES, Math.max(MIN_PIECES, Math.round(MIN_PIECES + volume * PIECES_PER_VOLUME)));
}

/**
 * Shards keep using the entity's material. Materials that the entity owns are freed when it's
 * disposed, so those are copied for the shards instead.
 */
function sharedMaterial(material: Material | Material[]): Material | Material[] {
    const share = (m: Material) => (isShared(m) ? m : markShared(m.clone()));
    return Array.isArray(material) ? material.map(share) : share(material);
}

function randomSpin(): number {
    return (Math.random() * 2 - 1) * MAX_SPIN;
}
