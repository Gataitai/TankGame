import UpdatableEntity from "@/entities/UpdatableEntity.ts";
import {Mesh, MeshStandardMaterial, SphereGeometry, Vector3, Sphere, Color, Box3} from "three";
import GameScene from "@/scene/GameScene.ts";
import ExplosionEffect from "@/effects/ExplosionEffect.ts";
import BreakableWall from "@/map/BreakableWall.ts";
import Tank from "@/entities/tanks/Tank.ts";

class Landmine extends UpdatableEntity {
    private _lifetime: number = 5; // seconds before it explodes automatically
    private _radius: number = 0.2; // Radius of the mine sphere
    private _hit: boolean = false; // If hit prematurely
    private _loaded: boolean = false; // Track if load is complete
    private _material!: MeshStandardMaterial;
    private _colorToggleTime: number = 0; // For blinking effect

    constructor(position: Vector3) {
        super(position);
    }

    public async load(): Promise<void> {
        const geometry = new SphereGeometry(this._radius, 16, 16);
        geometry.computeBoundingSphere(); // Compute bounding sphere for explosion use

        this._material = new MeshStandardMaterial({ color: 0xffff00 }); // Yellow
        const mineMesh = new Mesh(geometry, this._material);

        // Position so half is below ground. Adjust if needed; for now place at ground level:
        mineMesh.position.z = 0;

        this.mesh.add(mineMesh);

        // Define a Box3 collider slightly above ground so bullets can hit it
        const colliderPos = this.mesh.position.clone();
        colliderPos.z += 0.5; // Raise collider above ground
        const halfSize = 0.2; // Half the width/height/depth of the box
        this.collider = new Box3(
            new Vector3(colliderPos.x - halfSize, colliderPos.y - halfSize, colliderPos.z - halfSize),
            new Vector3(colliderPos.x + halfSize, colliderPos.y + halfSize, colliderPos.z + halfSize)
        );

        this._loaded = true;
    }

    public update(deltaT: number): void {
        this._lifetime -= deltaT;

        // If close to explode, blink color
        if (this._loaded && this._lifetime < 1.0) {
            this._colorToggleTime += deltaT;
            if (this._colorToggleTime > 0.1) {
                const currentColor = this._material.color;
                if (currentColor.equals(new Color(0xffff00))) {
                    this._material.color.set(0xfc4c4c);
                } else {
                    this._material.color.set(0xffff00);
                }
                this._colorToggleTime = 0;
            }
        }

        if ((this._lifetime <= 0 || this._hit) && this._loaded) {
            this.explode();
        }
    }

    public hit(): void {
        // Trigger explode early if loaded
        if (this._loaded) {
            this._hit = true;
        }
    }

    private explode(): void {

        if (!this.collider) {
            this.shouldDispose = true;
            return;
        }

        const damageSphere = new Sphere(this.mesh.position.clone(), 2.0);

        // Check entities in range
        const entities = GameScene.instance.gameEntities;
        for (let entity of entities) {
            if (entity.collider && entity.collider.intersectsSphere(damageSphere)) {
                if (entity instanceof Tank) {
                    entity.destroy();
                } else if (entity instanceof BreakableWall) {
                    entity.destroy();
                } else if (entity instanceof Landmine && entity !== this) {
                    // Chain reaction: hit other mines so they explode too
                    entity.hit();
                }
            }
        }

        // Show explosion effect
        const explosion = new ExplosionEffect(this.mesh.position, 2);
        explosion.load().then(() => {
            GameScene.instance.addToScene(explosion);
            GameScene.instance.shakeCamera(0.3, 0.1);
        });

        this.shouldDispose = true;
    }
}

export default Landmine;
