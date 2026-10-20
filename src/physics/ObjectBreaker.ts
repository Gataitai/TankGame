import { DoubleSide, Material, Mesh, Plane, Texture, Vector3 } from "three";
import type Entity from "@/entities/Entity";
import Fragment from "@/physics/Fragment";
import FragmentMaterials from "@/physics/FragmentMaterials";
import MeshPart from "@/physics/MeshPart";
import { isShared } from "@/utils/SharedResources";

/** How an entity shatters (set `entity.breakSettings`). */
export type BreakSettings = {
    /** Roughly how many pieces it breaks into (spread over its meshes by size). */
    pieces: number;
    /** Seconds before the pieces disappear, or null to keep them lying around. */
    lifetime: number | null;
    /** Whether a projectile hit breaks it (otherwise only code calling `break()` does, e.g. a tank's destroy). */
    breaksOnImpact?: boolean;
};

/** What broke an entity: where it was hit, and optionally the direction and strength of the hit. */
export type Impact = {
    point: Vector3;
    direction?: Vector3;
    strength?: number;
};

/** Strength of the burst when nothing specific hit the object. */
const DEFAULT_STRENGTH = 6;
const MAX_SPIN = 8;
/** How far from a chunk's middle a crack may run (as a fraction of its size), so pieces vary in size. */
const CRACK_OFFSET = 0.35;
/** How much a crack may be tilted away from straight across the chunk. */
const CRACK_TILT = 0.7;
const CRACK_ATTEMPTS = 6;

/**
 * Shatters entities like glass: the entity's own meshes are cracked into pieces, and each piece
 * becomes a small physics object (a Fragment) that flies apart from the impact and falls to the
 * ground.
 *
 * Every mesh of the entity breaks separately (e.g. a tank's body and its turret), so each piece
 * is a real part of the original model with its original materials, colours and textures. The
 * pieces are spread over the meshes by their size. A mesh is broken by cracking it in two along
 * a slightly random plane, then cracking the biggest remaining chunk again, and so on, until it
 * has its number of pieces. Triangles are cut exactly along the cracks, so the pieces fit
 * together like broken glass.
 *
 * The scene owns one breaker (`scene.breaker`); entities use it through `entity.break()`.
 */
class ObjectBreaker {
    /** Replaces `entity` by flying pieces of it. The entity itself still has to be removed (break() does). */
    public shatter(entity: Entity, settings: BreakSettings, impact?: Impact): Fragment[] {
        const parts = this.partsOf(entity);
        if (parts.length === 0) return [];

        // Read the motion before the body is removed, so the pieces carry on moving the same way
        const baseVelocity = entity.rigidbody?.velocity.clone() ?? new Vector3();
        entity.setPhysics("none");
        entity.mesh.visible = false;

        const origin = impact?.point ?? this.centerOf(parts);
        const strength = impact?.strength ?? DEFAULT_STRENGTH;
        const pieceCounts = this.distributePieces(parts, Math.max(1, Math.round(settings.pieces)));

        const fragments: Fragment[] = [];
        parts.forEach((part, i) => {
            const materials = new FragmentMaterials(part.materials.map((material) => this.pieceMaterial(material)));
            for (const chunk of this.crack(part, pieceCounts[i])) {
                const { geometry, position } = chunk.toGeometry();
                const velocity = this.burstVelocity(position, origin, strength, impact?.direction).add(baseVelocity);
                const spin = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * MAX_SPIN);
                const fragment = new Fragment(position, geometry, materials, settings.lifetime, velocity, spin);
                fragments.push(fragment);
                void entity.scene.add(fragment);
            }
        });
        return fragments;
    }

    /** Every visible mesh of the entity (e.g. a tank's body and turret), in world space. */
    private partsOf(entity: Entity): MeshPart[] {
        const parts: MeshPart[] = [];
        entity.mesh.traverseVisible((child) => {
            const mesh = child as Mesh;
            if (!mesh.isMesh) return;
            const part = MeshPart.fromMesh(mesh);
            if (part) parts.push(part);
        });
        return parts;
    }

    /** Gives every part at least one piece and spreads the rest by surface area. */
    private distributePieces(parts: MeshPart[], pieces: number): number[] {
        const areas = parts.map((part) => part.area);
        const totalArea = areas.reduce((sum, area) => sum + area, 0) || 1;
        const spare = Math.max(0, pieces - parts.length);
        return areas.map((area) => 1 + Math.round((spare * area) / totalArea));
    }

    /** Cracks a part into `pieces` chunks; the biggest chunk is cracked next each time. */
    private crack(part: MeshPart, pieces: number): MeshPart[] {
        const chunks = [part];
        const uncrackable = new Set<MeshPart>();

        while (chunks.length < pieces) {
            const candidates = chunks.filter((chunk) => !uncrackable.has(chunk));
            if (candidates.length === 0) break;
            const biggest = candidates.reduce((a, b) => (a.bounds().size.length() >= b.bounds().size.length() ? a : b));

            const halves = this.crackInTwo(biggest);
            if (!halves) {
                uncrackable.add(biggest);
                continue;
            }
            chunks.splice(chunks.indexOf(biggest), 1, ...halves);
        }
        return chunks;
    }

    /**
     * Cuts a chunk along a crack roughly across its longest side, a bit off-centre and tilted.
     * Returns null if no crack splits it into two non-empty halves.
     */
    private crackInTwo(chunk: MeshPart): [MeshPart, MeshPart] | null {
        const { center, size } = chunk.bounds();
        const longest = size.x >= size.y && size.x >= size.z ? new Vector3(1, 0, 0)
            : size.y >= size.z ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);

        for (let attempt = 0; attempt < CRACK_ATTEMPTS; attempt++) {
            const tilt = new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * CRACK_TILT);
            const normal = longest.clone().add(tilt).normalize();
            const point = center.clone().add(new Vector3(
                (Math.random() - 0.5) * size.x * CRACK_OFFSET,
                (Math.random() - 0.5) * size.y * CRACK_OFFSET,
                (Math.random() - 0.5) * size.z * CRACK_OFFSET,
            ));

            const [front, back] = chunk.split(new Plane().setFromNormalAndCoplanarPoint(normal, point));
            if (!front.isEmpty && !back.isEmpty) return [front, back];
        }
        return null;
    }

    // ---- Helpers -----------------------------------------------------------------------

    private centerOf(parts: MeshPart[]): Vector3 {
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const part of parts) {
            const bounds = part.bounds();
            min.min(bounds.min);
            max.max(bounds.max);
        }
        return min.add(max).multiplyScalar(0.5);
    }

    /** Away from the impact (and a bit up), plus a push in the direction of the hit. */
    private burstVelocity(position: Vector3, origin: Vector3, strength: number, direction?: Vector3): Vector3 {
        const away = position.clone().sub(origin);
        if (away.lengthSq() < 1e-6) away.set(Math.random() - 0.5, Math.random() - 0.5, 0.5);
        away.normalize().multiplyScalar((1.5 + strength * 0.25) * (0.6 + Math.random() * 0.8));
        away.z += 1 + Math.random() * 2;
        if (direction) away.addScaledVector(direction.clone().normalize(), strength * 0.15);
        return away;
    }

    /**
     * The pieces' copy of a material: it shows both sides (the pieces are open where they were
     * cracked) and has its own copies of textures the original entity frees when it's removed.
     */
    private pieceMaterial(source: Material): Material {
        const material = source.clone();
        material.side = DoubleSide;
        for (const [key, value] of Object.entries(material)) {
            if (value instanceof Texture && !isShared(value)) {
                const texture = value.clone();
                texture.userData.ownedByFragments = true; // Freed by FragmentMaterials
                (material as any)[key] = texture;
            }
        }
        return material;
    }
}

export default ObjectBreaker;
