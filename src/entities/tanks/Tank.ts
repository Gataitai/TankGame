import { Box3, Mesh, MeshStandardMaterial, Sphere, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import ResourceManager from "@/utils/ResourceManager.ts";
import GameScene from "@/scene/GameScene.ts";
import ExplosionEffect from "@/effects/ExplosionEffect.ts";
import TreadsCanvas from "@/map/TreadsCanvas.ts";
import DeathMarkEffect from "@/effects/DeathMarkEffect.ts";
import Landmine from "@/entities/weapons/Landmine.ts";

abstract class Tank extends UpdatableEntity {
    protected _rotation: number = 0;
    protected _turretRotation: number = 0;
    protected _tankTurretMesh!: Mesh;

    protected readonly _moveSpeed: number; // Store movement speed here

    // Distance-based tread spawning
    private _distanceSinceLastTread: number = 0;
    private readonly _treadSpawnDistance: number = 0.25; // Distance between treads, adjust as desired

    protected constructor(position: Vector3, moveSpeed: number) {
        super(position);
        this._moveSpeed = moveSpeed;
    }

    public async load(): Promise<void> {
        const tankModel = ResourceManager.instance.getModel("player");
        if (!tankModel) {
            throw new Error("Unable to get tank model");
        }

        const tankSceneData = tankModel.scene.clone();

        tankSceneData.traverse((child) => {
            if ((child as Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        const tankBodyMesh = tankSceneData.children.find((m) => m.name === "Body") as Mesh;
        const tankTurretMesh = tankSceneData.children.find((m) => m.name === "Turret") as Mesh;

        if (!tankBodyMesh || !tankTurretMesh) {
            throw new Error("Unable to load tank model parts");
        }

        // Apply metallic and roughness settings to the body and turret materials
        tankBodyMesh.material = new MeshStandardMaterial({
            metalness: 0.9,
            roughness: 0.2,
        });

        tankTurretMesh.material = new MeshStandardMaterial({
            metalness: 0.8,
            roughness: 0.3,
        });

        this.mesh.add(tankBodyMesh);
        this.mesh.add(tankTurretMesh);

        this._tankTurretMesh = tankTurretMesh;

        const collider = new Box3()
            .setFromObject(this.mesh)
            .getBoundingSphere(new Sphere(this.mesh.position.clone()));
        collider.radius *= 0.5;
        this.collider = collider;
    }

    private spawnTreads(movement: Vector3): void {
        const distanceTraveled = movement.length();
        if (distanceTraveled > 0) {
            this._distanceSinceLastTread += distanceTraveled;

            if (this._distanceSinceLastTread >= this._treadSpawnDistance) {
                // Get the GameMap entity from GameScene
                const canvas = GameScene.instance.gameEntities.find(
                    (entity) => entity instanceof TreadsCanvas
                ) as TreadsCanvas;

                if (canvas) {
                    canvas.drawTreads(this.mesh.position.clone(), this._rotation);
                }

                this._distanceSinceLastTread = 0;
            }
        }
    }

    //collision detection
    protected canMove(movement: Vector3): boolean {
        const testingSphere = (this.collider as Sphere).clone();
        testingSphere.center.add(movement);

        const colliders = GameScene.instance.gameEntities.filter(
            (e) =>
                e !== this &&
                e.collider &&
                e.collider!.intersectsSphere(testingSphere) &&
                !(e instanceof Landmine)
        );

        return colliders.length === 0;
    }

    protected applyMovement(movement: Vector3): void {
        this.mesh.position.add(movement);
        (this.collider as Sphere).center.add(movement);
        this.spawnTreads(movement); // Distance-based tread spawning
    }

    public abstract update(deltaT: number): void;

    public destroy(): void {
        this.shouldDispose = true;
        const explosion = new ExplosionEffect(this.mesh.position, 2);
        const deathMarkEffect = new DeathMarkEffect(this.mesh.position)
        deathMarkEffect.load().then(() => {
            GameScene.instance.addToScene(deathMarkEffect);
        })
        explosion.load().then(() => {
            GameScene.instance.addToScene(explosion);
        });
    }
}

export default Tank;
