import { BufferAttribute, BufferGeometry, Float32BufferAttribute, InterleavedBufferAttribute, Material, Matrix3, Mesh, Plane, Vector3 } from "three";

/** Where one vertex attribute (position, normal, uv, color...) sits in a vertex's numbers. */
type AttributeSlot = { name: string; itemSize: number; offset: number };

/** A triangle: three vertices (all their attributes in one array each) and its material slot. */
type Triangle = { vertices: [Float32Array, Float32Array, Float32Array]; material: number };

/** Attributes that can't simply be copied into a loose piece (they depend on bones or on the old shape). */
const SKIPPED_ATTRIBUTES = new Set(["skinIndex", "skinWeight", "tangent"]);
/** Pieces smaller than this (in area) are dropped when cutting, they'd be invisible anyway. */
const MIN_TRIANGLE_AREA = 1e-8;

/**
 * The triangles of one mesh of an entity (e.g. the body or the turret of a tank) in world space,
 * keeping every vertex attribute (normals, uvs, vertex colours...) and the mesh's materials.
 *
 * A part can be cut in two along a plane (`split`), which cuts the triangles that cross the plane
 * exactly at it, so the two halves fit together like pieces of broken glass. A part becomes a
 * piece's geometry with `toGeometry`.
 */
class MeshPart {
    private readonly _positionOffset: number;

    private constructor(
        private readonly _slots: AttributeSlot[],
        private readonly _stride: number,
        private readonly _triangles: Triangle[],
        /** The source mesh's materials, indexed by Triangle.material. */
        public readonly materials: Material[],
    ) {
        this._positionOffset = _slots.find((slot) => slot.name === "position")!.offset;
    }

    /** Reads a mesh (in world space). Returns null if it has nothing to draw. */
    public static fromMesh(mesh: Mesh): MeshPart | null {
        const geometry = mesh.geometry;
        const position = geometry?.getAttribute("position");
        if (!position) return null;

        const slots: AttributeSlot[] = [];
        let stride = 0;
        for (const [name, attribute] of Object.entries(geometry.attributes)) {
            if (SKIPPED_ATTRIBUTES.has(name)) continue;
            slots.push({ name, itemSize: attribute.itemSize, offset: stride });
            stride += attribute.itemSize;
        }

        mesh.updateWorldMatrix(true, false);
        const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrixWorld);
        const point = new Vector3();
        const readVertex = (index: number): Float32Array => {
            const vertex = new Float32Array(stride);
            for (const slot of slots) {
                const attribute = geometry.getAttribute(slot.name) as BufferAttribute | InterleavedBufferAttribute;
                for (let c = 0; c < slot.itemSize; c++) vertex[slot.offset + c] = attribute.getComponent(index, c);
                if (slot.name === "position") {
                    point.fromArray(vertex, slot.offset).applyMatrix4(mesh.matrixWorld).toArray(vertex, slot.offset);
                } else if (slot.name === "normal") {
                    point.fromArray(vertex, slot.offset).applyMatrix3(normalMatrix).normalize().toArray(vertex, slot.offset);
                }
            }
            return vertex;
        };

        const index = geometry.index;
        const count = index ? index.count : position.count;
        const groups = geometry.groups.length > 0 ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

        const triangles: Triangle[] = [];
        for (const group of groups) {
            const material = Math.min(group.materialIndex ?? 0, materials.length - 1);
            const end = Math.min(count, group.start + group.count);
            for (let i = group.start; i + 2 < end; i += 3) {
                const vertex = (k: number) => readVertex(index ? index.getX(i + k) : i + k);
                triangles.push({ vertices: [vertex(0), vertex(1), vertex(2)], material });
            }
        }
        return triangles.length > 0 ? new MeshPart(slots, stride, triangles, materials) : null;
    }

    public get isEmpty(): boolean {
        return this._triangles.length === 0;
    }

    /** Total surface area, used to give bigger parts more pieces. */
    public get area(): number {
        const a = new Vector3(), b = new Vector3(), c = new Vector3();
        return this._triangles.reduce((sum, triangle) => {
            this.positionOf(triangle.vertices[0], a);
            this.positionOf(triangle.vertices[1], b).sub(a);
            this.positionOf(triangle.vertices[2], c).sub(a);
            return sum + b.cross(c).length() / 2;
        }, 0);
    }

    public bounds(): { min: Vector3; max: Vector3; center: Vector3; size: Vector3 } {
        const min = new Vector3(Infinity, Infinity, Infinity);
        const max = new Vector3(-Infinity, -Infinity, -Infinity);
        const p = new Vector3();
        for (const triangle of this._triangles) {
            for (const vertex of triangle.vertices) {
                this.positionOf(vertex, p);
                min.min(p);
                max.max(p);
            }
        }
        return { min, max, center: min.clone().add(max).multiplyScalar(0.5), size: max.clone().sub(min) };
    }

    /**
     * Cuts the part along a plane into the part in front of it and the part behind it.
     * Triangles crossing the plane are cut exactly at the plane (their attributes interpolated).
     */
    public split(plane: Plane): [MeshPart, MeshPart] {
        const front: Triangle[] = [];
        const back: Triangle[] = [];
        const p = new Vector3();

        for (const triangle of this._triangles) {
            const distances = triangle.vertices.map((vertex) => plane.distanceToPoint(this.positionOf(vertex, p)));
            if (distances.every((d) => d >= 0)) {
                front.push(triangle);
            } else if (distances.every((d) => d <= 0)) {
                back.push(triangle);
            } else {
                this.clip(triangle, distances, 1, front);
                this.clip(triangle, distances, -1, back);
            }
        }
        return [this.withTriangles(front), this.withTriangles(back)];
    }

    /** The part as a geometry centred on its own middle (returned as `position`, in world space). */
    public toGeometry(): { geometry: BufferGeometry; position: Vector3 } {
        const position = this.bounds().center;
        const sorted = [...this._triangles].sort((a, b) => a.material - b.material);
        const geometry = new BufferGeometry();

        for (const slot of this._slots) {
            const values = new Float32Array(sorted.length * 3 * slot.itemSize);
            let i = 0;
            for (const triangle of sorted) {
                for (const vertex of triangle.vertices) {
                    for (let c = 0; c < slot.itemSize; c++) values[i++] = vertex[slot.offset + c];
                }
            }
            if (slot.name === "position") {
                for (let v = 0; v < values.length; v += 3) {
                    values[v] -= position.x;
                    values[v + 1] -= position.y;
                    values[v + 2] -= position.z;
                }
            }
            geometry.setAttribute(slot.name, new Float32BufferAttribute(values, slot.itemSize));
        }

        // Interpolated normals got shorter where triangles were cut
        const normal = geometry.getAttribute("normal") as BufferAttribute | undefined;
        if (normal) {
            const n = new Vector3();
            for (let v = 0; v < normal.count; v++) {
                n.fromBufferAttribute(normal, v).normalize();
                normal.setXYZ(v, n.x, n.y, n.z);
            }
        } else {
            geometry.computeVertexNormals();
        }

        // One draw group per material
        sorted.forEach((triangle, i) => {
            if (i === 0 || sorted[i - 1].material !== triangle.material) geometry.addGroup(i * 3, 0, triangle.material);
            geometry.groups[geometry.groups.length - 1].count += 3;
        });

        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        return { geometry, position };
    }

    // ---- Helpers -----------------------------------------------------------------------

    /** Keeps the side of `triangle` where sign * distance >= 0, as triangles added to `out`. */
    private clip(triangle: Triangle, distances: number[], sign: number, out: Triangle[]): void {
        const polygon: Float32Array[] = [];
        for (let i = 0; i < 3; i++) {
            const j = (i + 1) % 3;
            const di = distances[i] * sign;
            const dj = distances[j] * sign;
            if (di >= 0) polygon.push(triangle.vertices[i]);
            if ((di >= 0) !== (dj >= 0)) polygon.push(this.lerp(triangle.vertices[i], triangle.vertices[j], di / (di - dj)));
        }

        // The kept side is a triangle or a quad: fan it into triangles (same winding as the original)
        for (let k = 1; k + 1 < polygon.length; k++) {
            const piece: Triangle = { vertices: [polygon[0], polygon[k], polygon[k + 1]], material: triangle.material };
            if (this.areaOf(piece) > MIN_TRIANGLE_AREA) out.push(piece);
        }
    }

    private lerp(a: Float32Array, b: Float32Array, t: number): Float32Array {
        const result = new Float32Array(this._stride);
        for (let k = 0; k < this._stride; k++) result[k] = a[k] + (b[k] - a[k]) * t;
        return result;
    }

    private areaOf(triangle: Triangle): number {
        const a = this.positionOf(triangle.vertices[0], new Vector3());
        const b = this.positionOf(triangle.vertices[1], new Vector3()).sub(a);
        const c = this.positionOf(triangle.vertices[2], new Vector3()).sub(a);
        return b.cross(c).length() / 2;
    }

    private positionOf(vertex: Float32Array, target: Vector3): Vector3 {
        return target.fromArray(vertex, this._positionOffset);
    }

    private withTriangles(triangles: Triangle[]): MeshPart {
        return new MeshPart(this._slots, this._stride, triangles, this.materials);
    }
}

export default MeshPart;
