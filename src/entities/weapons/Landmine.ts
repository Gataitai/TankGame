import { Box3, Mesh, MeshStandardMaterial, Sphere, SphereGeometry, Vector3 } from "three";
import UpdatableEntity from "@/entities/UpdatableEntity";
import Tank from "@/entities/tanks/Tank";
import BreakableWall from "@/map/BreakableWall";
import ExplosionEffect from "@/effects/ExplosionEffect";
import GameScene from "@/scene/GameScene";
import { markShared } from "@/utils/SharedResources";
import { HIT_SHAKE } from "@/config";

const RADIUS = 0.2;
const FUSE_TIME = 5;        // seconds until it explodes by itself
const BLINK_START = 1;      // start blinking this many seconds before exploding
const BLINK_INTERVAL = 0.1;
const BLAST_RADIUS = 2;
const COLOR = 0xffff00;
const BLINK_COLOR = 0xfc4c4c;

const GEOMETRY = markShared(new SphereGeometry(RADIUS, 16, 16));

class Landmine extends UpdatableEntity {
    private _fuse = FUSE_TIME;
    private _triggered = false;
    private _blinkTimer = 0;
    private _blinkOn = false;
    private _material!: MeshStandardMaterial;

    constructor(position: Vector3) {
        super(position);
        this.blocksMovement = false; // Tanks can drive over mines
    }

    public async load(): Promise<void> {
        this._material = new MeshStandardMaterial({ color: COLOR });
        this.mesh.add(new Mesh(GEOMETRY, this._material));

        // Box collider raised to projectile height so bullets can hit it
        const center = this.position.clone();
        center.z += 0.5;
        this.collider = new Box3().setFromCenterAndSize(center, new Vector3(RADIUS * 2, RADIUS * 2, RADIUS * 2));
    }

    public update(deltaT: number): void {
        this._fuse -= deltaT;

        if (this._fuse < BLINK_START) {
            this._blinkTimer += deltaT;
            if (this._blinkTimer > BLINK_INTERVAL) {
                this._blinkOn = !this._blinkOn;
                this._material.color.set(this._blinkOn ? BLINK_COLOR : COLOR);
                this._blinkTimer = 0;
            }
        }

        if (this._fuse <= 0 || this._triggered) {
            this.explode();
        }
    }

    /** Makes the mine explode on its next update (hit by a shot or another explosion). */
    public trigger(): void {
        this._triggered = true;
    }

    private explode(): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;

        const blast = new Sphere(this.position.clone(), BLAST_RADIUS);
        for (const entity of GameScene.instance.queryColliders(blast, this)) {
            if (entity instanceof Tank || entity instanceof BreakableWall) {
                entity.destroy();
            } else if (entity instanceof Landmine) {
                entity.trigger(); // Chain reaction
            }
        }

        void GameScene.instance.spawn(new ExplosionEffect(this.position, 2));
        GameScene.instance.shakeCamera(HIT_SHAKE.duration, HIT_SHAKE.intensity);
    }
}

export default Landmine;
