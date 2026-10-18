import {
    BufferGeometry,
    CylinderGeometry,
    Mesh,
    MeshPhongMaterial,
    Sphere,
    SphereGeometry,
    Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import Entity from "@/entities/Entity";
import UpdatableEntity from "@/entities/UpdatableEntity";
import Landmine from "@/entities/weapons/Landmine";
import ExplosionEffect from "@/effects/ExplosionEffect";
import TrailEffect from "@/effects/TrailEffect";
import GameScene from "@/scene/GameScene";
import { markShared } from "@/utils/SharedResources";
import { directionFromAngle } from "@/utils/MathUtils";
import { HIT_SHAKE } from "@/config";
import EnemyTank from "@/entities/tanks/EnemyTank";

const RADIUS = 0.075;
const BODY_LENGTH = 0.2;
const SEGMENTS = 16;
const TRAIL_INTERVAL = 0.05;
/** The projectile model points along +Y. */
const MODEL_FORWARD = new Vector3(0, 1, 0);

// Every projectile uses the same shape; materials are shared per colour.
let sharedGeometry: BufferGeometry | null = null;
const sharedMaterials = new Map<number, MeshPhongMaterial>();

function getGeometry(): BufferGeometry {
    if (!sharedGeometry) {
        const body = new CylinderGeometry(RADIUS, RADIUS, BODY_LENGTH, SEGMENTS);
        const tip = new SphereGeometry(RADIUS, SEGMENTS, SEGMENTS).translate(0, BODY_LENGTH / 2, 0);
        sharedGeometry = markShared(mergeGeometries([body, tip]));
        body.dispose();
        tip.dispose();
    }
    return sharedGeometry;
}

function getMaterial(color: number): MeshPhongMaterial {
    let material = sharedMaterials.get(color);
    if (!material) {
        material = markShared(new MeshPhongMaterial({ color }));
        sharedMaterials.set(color, material);
    }
    return material;
}

/**
 * Base class for bullets and missiles: movement, smoke trail and the collision rules they share.
 * Subclasses decide what happens when hitting an obstacle (walls) via onHitObstacle().
 */
abstract class Projectile extends UpdatableEntity {
    protected readonly _velocity: Vector3;
    private _trailTimer = TRAIL_INTERVAL;
    private readonly _direction = new Vector3();

    protected constructor(
        position: Vector3,
        angle: number,
        protected readonly speed: number,
        private readonly _color: number
    ) {
        super(position);
        this._velocity = directionFromAngle(angle, speed);
    }

    public async load(): Promise<void> {
        this.setMesh(new Mesh(getGeometry(), getMaterial(this._color)));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.alignWithVelocity();

        this.collider = new Sphere(this.position.clone(), RADIUS);
    }

    public update(deltaT: number): void {
        this._trailTimer -= deltaT;
        if (this._trailTimer <= 0) {
            void GameScene.instance.spawn(new TrailEffect(this.position, 0.5));
            this._trailTimer = TRAIL_INTERVAL;
        }

        this.position.addScaledVector(this._velocity, deltaT);
        (this.collider as Sphere).center.copy(this.position);

        this.checkCollisions();
        this.alignWithVelocity();
    }

    /** Explodes the projectile. Safe to call more than once. */
    public explodeAndDispose(): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;
        void GameScene.instance.spawn(new ExplosionEffect(this.position, 1));
    }

    /** Called when hitting something that isn't a projectile, mine or tank (i.e. a wall). */
    protected onHitObstacle(_obstacle: Entity): void {
        this.explodeAndDispose();
    }

    protected alignWithVelocity(): void {
        if (this._velocity.lengthSq() === 0) return;
        this._direction.copy(this._velocity).normalize();
        this.mesh.quaternion.setFromUnitVectors(MODEL_FORWARD, this._direction);
    }

    private checkCollisions(): void {
        const hit = GameScene.instance.queryColliders(this.collider as Sphere, this)[0];
        if (!hit) return;

        if (hit instanceof Projectile) {
            hit.explodeAndDispose();
            this.explodeAndDispose();
        } else if (hit instanceof Landmine) {
            hit.trigger();
            this.explodeAndDispose();
        } else if (hit instanceof EnemyTank) {
            hit.destroy();
            this.explodeAndDispose();
            GameScene.instance.shakeCamera(HIT_SHAKE.duration, HIT_SHAKE.intensity);
        } else {
            this.onHitObstacle(hit);
        }
    }
}

export default Projectile;
