import { Sphere as SphereShape } from "cannon-es";
import { Mesh, MeshStandardMaterial, Sphere, SphereGeometry, Vector3 } from "three";
import Entity from "@/entities/Entity";
import ResourceManager from "@/utils/ResourceManager";
import type { PhysicsDescription, PhysicsMode } from "@/physics/RigidBody";

const RADIUS = 0.5;
const MASS = 1;

export type PhysicsBallOptions = {
    /** Shatters when hit by a projectile. */
    breakable?: boolean;
    /** When breakable: whether the pieces stay on the ground (otherwise they disappear). */
    keepPieces?: boolean;
};

/**
 * A rolling ball. It bounces a little and slowly rolls to a stop (via damping), and is pushed
 * by tanks, kicked by projectiles and blasts, and collides with other physics objects.
 */
class PhysicsBall extends Entity {
    constructor(position: Vector3, options: PhysicsBallOptions = {}) {
        super(new Vector3(position.x, position.y, RADIUS));
        if (options.breakable) {
            this.breakSettings = { pieces: 12, lifetime: options.keepPieces ? null : 4, breaksOnImpact: true };
        }
    }

    public get defaultPhysics(): PhysicsMode {
        return "dynamic";
    }

    public get radius(): number {
        return RADIUS;
    }

    public async load(): Promise<void> {
        const material = new MeshStandardMaterial({ map: ResourceManager.instance.getRandomWallTexture() });
        this.setMesh(new Mesh(new SphereGeometry(RADIUS, 32, 16), material));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.collider = new Sphere(this.position.clone(), RADIUS);
    }

    /** A bouncy sphere; damping makes it roll to a stop instead of rolling forever. */
    protected describePhysics(): PhysicsDescription {
        return {
            ...super.describePhysics(),
            shape: new SphereShape(RADIUS),
            offset: new Vector3(),
            mass: MASS,
            surface: "bouncy",
            linearDamping: 0.15,
            angularDamping: 0.3,
        };
    }
}

export default PhysicsBall;
