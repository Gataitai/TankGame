import Projectile from "@/entities/weapons/Projectile.ts";
import {Plane, Raycaster, Sphere, Vector2, Vector3} from "three";
import GameScene from "@/scene/GameScene.ts";
import BreakableWall from "@/map/BreakableWall.ts";
import Tank from "@/entities/tanks/Tank.ts";
import projectile from "@/entities/weapons/Projectile.ts";
import Landmine from "@/entities/weapons/Landmine.ts";

class Missile extends Projectile {
    private _targetPosition: Vector3;
    private _mousePosition: Vector2 = new Vector2();
    private _hasMovedMouse: boolean = false;

    constructor(position: Vector3, turretRotation: number) {
        const speed = 10; // Missile-specific speed
        const color = 0xff5555; // Missile-specific color
        super(position, speed, color);

        this._velocity = new Vector3(
            speed * Math.sin(turretRotation),
            -speed * Math.cos(turretRotation),
            0
        );

        this._targetPosition = new Vector3();
        window.addEventListener("mousemove", this.handleMouseMove);
    }

    private handleMouseMove = (event: MouseEvent) => {
        const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        this._mousePosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._mousePosition.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        const raycaster = new Raycaster();
        const planeZ = new Plane(new Vector3(0, 0, 1), 0);
        raycaster.setFromCamera(this._mousePosition, GameScene.instance.camera);

        const target = new Vector3();
        raycaster.ray.intersectPlane(planeZ, target);

        this._targetPosition.set(target.x, target.y, 0);
        this._hasMovedMouse = true;
    };

    protected checkCollisions(): void {
        const colliders = GameScene.instance.gameEntities.filter(
            (c) =>
                c.collider &&
                c !== this &&
                c.collider.intersectsSphere(this.collider as Sphere)
        );

        if (colliders.length) {
            const collider = colliders[0];

            if (collider instanceof projectile) {
                collider.explodeAndDispose();
                this.explodeAndDispose();
                return;
            }

            if (collider instanceof Landmine) {
                collider.hit();
                this.explodeAndDispose();
                return;
            }

            // Always destroy breakable walls
            if (collider instanceof BreakableWall) {
                collider.destroy();
                this.explodeAndDispose();
                GameScene.instance.shakeCamera(0.3, 0.1);
                return;
            }

            // Handle other collisions (e.g., tanks or normal walls)
            if (collider instanceof Tank) {
                collider.destroy();
                this.explodeAndDispose();
                GameScene.instance.shakeCamera(0.3, 0.1);
            } else {
                // For normal walls or unknown objects
                this.explodeAndDispose();
            }
        }
    }

    public async update(deltaT: number): Promise<void> {
        if (!this._hasMovedMouse) {
            // Predict a target position 10 units ahead in the current direction
            this._targetPosition.copy(
                this.mesh.position.clone().add(this._velocity.clone().multiplyScalar(10))
            );
        }

        // Calculate direction to target in the XY plane
        const missileToTarget = this._targetPosition.clone().sub(this.mesh.position);
        missileToTarget.z = 0; // Lock movement to the XY plane

        // If close enough to the target, explode
        if (missileToTarget.lengthSq() < 0.5) {
            this.explodeAndDispose();
            return;
        }

        // Normalize the direction and set the velocity (lock Z-axis)
        missileToTarget.normalize();
        this._velocity.copy(missileToTarget.multiplyScalar(this.speed));
        this._velocity.z = 0; // Ensure no vertical movement

        // Update position and rotation
        this.mesh.position.z = 0.5; // Keep the missile at a constant height
        this.alignWithVelocity();

        // Call the parent update to handle collisions and effects
        await super.update(deltaT);
    }


    public dispose(): void {
        super.dispose();
        window.removeEventListener("mousemove", this.handleMouseMove);
    }
}

export default Missile;
