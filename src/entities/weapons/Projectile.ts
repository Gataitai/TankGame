import {
    Mesh,
    MeshPhongMaterial,
    Sphere,
    Vector3,
    CylinderGeometry,
    SphereGeometry,
    Quaternion,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import GameScene from "@/scene/GameScene.ts";
import ExplosionEffect from "@/effects/ExplosionEffect.ts";
import TrailEffect from "@/effects/TrailEffect.ts";

abstract class Projectile extends UpdatableEntity {
    protected _velocity: Vector3;
    private _smokeSpawnTime: number = 0.05;

    protected constructor(
        position: Vector3,
        protected speed: number,
        protected color: number
    ) {
        super(position);
        this._velocity = new Vector3(); // Initialize as zero, calculated in subclass
    }

    public async load(): Promise<void> {
        const radius = 0.075; // Radius of the sphere and cylinder
        const height = 0.2;   // Height of the cylindrical body
        const radialSegments = 16; // Number of segments for the geometry

        // Create the cylindrical body
        const bodyGeometry = new CylinderGeometry(radius, radius, height, radialSegments);

        // Create the full spherical tip
        const sphereGeometry = new SphereGeometry(radius, radialSegments, radialSegments);

        // Position the sphere such that it overlaps the top half of the cylinder
        sphereGeometry.translate(0, height / 2, 0);

        // Merge the two geometries into one
        const geometry = mergeGeometries([bodyGeometry, sphereGeometry]);

        // Create the material for the projectile
        const material = new MeshPhongMaterial({ color: this.color });

        // Create the mesh from the geometry and material
        this.mesh = new Mesh(geometry, material);

        // Set the position of the mesh
        this.mesh.position.copy(this.position);

        // Align the projectile with its velocity
        this.alignWithVelocity();

        // Enable shadow casting and receiving
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Define a spherical collider for the projectile
        this.collider = new Sphere(this.mesh.position.clone(), radius);
    }

    public async update(deltaT: number): Promise<void> {
        this._smokeSpawnTime -= deltaT;

        if (this._smokeSpawnTime <= 0) {
            const smokeEffect = new TrailEffect(this.mesh.position.clone(), 0.5);
            smokeEffect.load().then(() => {
                GameScene.instance.addToScene(smokeEffect);
            });
            this._smokeSpawnTime = 0.05;
        }

        const computedMovement = this._velocity.clone().multiplyScalar(deltaT);
        this.mesh.position.add(computedMovement);

        (this.collider as Sphere).center.copy(this.mesh.position);

        this.checkCollisions();
        this.alignWithVelocity();
    }

    protected abstract checkCollisions(): void;

    protected alignWithVelocity(): void {
        const defaultDirection = new Vector3(0, 1, 0);
        const velocityDirection = this._velocity.clone().normalize();
        const quaternion = new Quaternion().setFromUnitVectors(defaultDirection, velocityDirection);
        this.mesh.quaternion.copy(quaternion);
    }

    public explodeAndDispose(): void {
        this.shouldDispose = true;
        const explosion = new ExplosionEffect(this.mesh.position, 1);
        explosion.load().then(() => {
            GameScene.instance.addToScene(explosion);
        });
    }
}

export default Projectile;
