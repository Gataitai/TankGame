import { Box as BoxShape, Vec3 } from "cannon-es";
import { BoxGeometry, Mesh, MeshStandardMaterial, Quaternion, RepeatWrapping, Sphere, Texture, Vector3 } from "three";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import type { PhysicsDescription, PhysicsMode } from "@/physics/RigidBody";

export type PhysicsBoxOptions = {
    /** Mass per cubic unit (default 1). */
    density?: number;
    /** Shatters when hit by a projectile or a blast. */
    breakable?: boolean;
    /** When breakable: whether the pieces stay on the ground (otherwise they disappear). */
    keepPieces?: boolean;
    /** Roughly how many pieces it breaks into (default: more for bigger boxes). */
    pieces?: number;
};

/** Seconds before the pieces of a broken box disappear (unless they're kept). */
const PIECE_LIFETIME = 5;

/**
 * A rectangular block (e.g. a pillar or a beam). It can be stacked, pushed, knocked over,
 * kicked and (optionally) shattered, and collides with everything else.
 *
 * The wall texture is tiled once per world unit on every face, so it looks like the walls
 * however long the block is.
 */
class PhysicsBox extends Entity {
    private readonly _size: Vector3;
    private readonly _density: number;
    private readonly _inverseRotation = new Quaternion();
    private readonly _local = new Vector3();

    /**
     * @param position centre of the box
     * @param size full width (x), depth (y) and height (z)
     */
    constructor(position: Vector3, size: Vector3, options: PhysicsBoxOptions = {}) {
        super(position);
        this._size = size.clone();
        this._density = options.density ?? 1;

        if (options.breakable) {
            const volume = size.x * size.y * size.z;
            this.breakSettings = {
                pieces: options.pieces ?? Math.round(Math.min(24, Math.max(8, volume * 4))),
                lifetime: options.keepPieces ? null : PIECE_LIFETIME,
                breaksOnImpact: true,
            };
        }
    }

    public get defaultPhysics(): PhysicsMode {
        return "dynamic";
    }

    public get size(): Vector3 {
        return this._size;
    }

    public async load(): Promise<void> {
        const geometry = new BoxGeometry(this._size.x, this._size.y, this._size.z);
        this.tileUvs(geometry);
        this.setMesh(new Mesh(geometry, new MeshStandardMaterial({ map: this.createTexture() })));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // A bounding sphere as collider; intersectsSphere() does the exact test
        this.collider = new Sphere(this.position.clone(), this._size.length() / 2);
    }

    protected describePhysics(): PhysicsDescription {
        const { x, y, z } = this._size;
        return {
            ...super.describePhysics(),
            shape: new BoxShape(new Vec3(x / 2, y / 2, z / 2)),
            offset: new Vector3(),
            mass: x * y * z * this._density,
        };
    }

    /** Exact test: does the sphere touch this (rotated) box? */
    public intersectsSphere(sphere: Sphere): boolean {
        // Move the sphere centre into the box's own coordinate system...
        this._inverseRotation.copy(this.mesh.quaternion).invert();
        const local = this._local.subVectors(sphere.center, this.position).applyQuaternion(this._inverseRotation);

        // ...where the box is axis aligned, so the closest point is a simple clamp
        const dx = Math.max(Math.abs(local.x) - this._size.x / 2, 0);
        const dy = Math.max(Math.abs(local.y) - this._size.y / 2, 0);
        const dz = Math.max(Math.abs(local.z) - this._size.z / 2, 0);
        return dx * dx + dy * dy + dz * dz <= sphere.radius * sphere.radius;
    }

    /** Own copy of a wall texture that repeats (disposed with the box). */
    private createTexture(): Texture {
        const texture = ResourceManager.instance.getRandomWallTexture().clone();
        texture.userData = {}; // Not shared
        texture.wrapS = RepeatWrapping;
        texture.wrapT = RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    /**
     * BoxGeometry maps the whole texture onto every face. Scale each face's UVs by the face's
     * size so the texture repeats once per world unit instead of stretching.
     */
    private tileUvs(geometry: BoxGeometry): void {
        const { x, y, z } = this._size;
        // Face order of BoxGeometry: +x, -x, +y, -y, +z, -z (4 vertices each); [u size, v size] per face
        const faceSizes: [number, number][] = [[z, y], [z, y], [x, z], [x, z], [x, y], [x, y]];
        const uv = geometry.getAttribute("uv");
        faceSizes.forEach(([uSize, vSize], face) => {
            for (let i = face * 4; i < face * 4 + 4; i++) {
                uv.setXY(i, uv.getX(i) * uSize, uv.getY(i) * vSize);
            }
        });
        uv.needsUpdate = true;
    }
}

export default PhysicsBox;
