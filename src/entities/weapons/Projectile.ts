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
import { markShared } from "@/utils/SharedResources";
import { directionFromAngle } from "@/utils/MathUtils";
import { HIT_SHAKE } from "@/config";
import EnemyTank from "@/entities/tanks/EnemyTank";
import Tank from "@/entities/tanks/Tank";
import type { Impact } from "@/physics/ObjectBreaker";

const RADIUS = 0.075;
const BODY_LENGTH = 0.2;
const SEGMENTS = 16;
const TRAIL_INTERVAL = 0.05;
/** Part of a kick that goes upwards, so a kicked ball hops a little. */
const KICK_LIFT = 0.25;
/** Projectiles further than this outside the map (e.g. fired over the walls) are removed. */
const OUT_OF_BOUNDS_MARGIN = 2;
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
    /** Impulse given to a physics object (like the ball) when this projectile hits it; also how hard it shatters things. */
    protected abstract readonly kickStrength: number;
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
            void this.scene.add(new TrailEffect(this.position, 0.5));
            this._trailTimer = TRAIL_INTERVAL;
        }

        this.position.addScaledVector(this._velocity, deltaT);
        (this.collider as Sphere).center.copy(this.position);

        if (this.isOutOfBounds()) {
            this.shouldDispose = true;
            return;
        }

        this.checkCollisions();
        this.alignWithVelocity();
    }

    /** E.g. fired from on top of a wall, over the border walls. */
    private isOutOfBounds(): boolean {
        const max = this.scene.mapSize + OUT_OF_BOUNDS_MARGIN;
        const { x, y } = this.position;
        return x < -OUT_OF_BOUNDS_MARGIN || y < -OUT_OF_BOUNDS_MARGIN || x > max || y > max;
    }

    /** Where and how hard this projectile hits (for shattering things). */
    protected get impact(): Impact {
        return { point: this.position.clone(), direction: this._velocity.clone(), strength: this.kickStrength };
    }

    /** Explodes the projectile. Safe to call more than once. */
    public explodeAndDispose(): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;
        void this.scene.add(new ExplosionEffect(this.position, 1));
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

    /** Kick in the direction the projectile flies, slightly upwards. */
    private kickImpulse(): Vector3 {
        const direction = this._velocity.clone().setZ(0).normalize();
        direction.z = KICK_LIFT;
        return direction.multiplyScalar(this.kickStrength);
    }

    private checkCollisions(): void {
        const hit = this.scene.queryColliders(this.collider as Sphere, this)[0];
        if (!hit) return;

        if (hit instanceof Projectile) {
            hit.explodeAndDispose();
            this.explodeAndDispose();
        } else if (hit instanceof Landmine) {
            hit.trigger();
            this.explodeAndDispose();
        } else if (hit instanceof EnemyTank) {
            hit.destroy(this.impact);
            this.explodeAndDispose();
            this.scene.shakeCamera(HIT_SHAKE.duration, HIT_SHAKE.intensity);
        } else if (hit.breakSettings?.breaksOnImpact) {
            hit.break(this.impact);
            this.explodeAndDispose();
        } else if (hit.rigidbody?.isDynamic && !(hit instanceof Tank)) {
            // At the point of impact, so it can spin or topple
            hit.rigidbody.applyImpulse(this.kickImpulse(), this.position);
            this.explodeAndDispose();
        } else {
            this.onHitObstacle(hit);
        }
    }
}

export default Projectile;
