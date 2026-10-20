import { Mesh, Sphere, SphereGeometry, Texture, Vector3 } from "three";
import { Sphere as SphereShape } from "cannon-es";
import Entity from "@/entities/Entity";
import { applyPropOptions, materialFor, WOOD_DENSITY, type PropOptions } from "@/entities/props/Block";
import { PhysicsMaterials } from "@/physics/PhysicsWorld";
import ResourceManager from "@/utils/ResourceManager";
import { markShared } from "@/utils/SharedResources";

export type BallOptions = PropOptions & { radius?: number };

const DEFAULT_RADIUS = 0.4;
const geometries = new Map<number, SphereGeometry>();

function geometryFor(radius: number): SphereGeometry {
    let geometry = geometries.get(radius);
    if (!geometry) {
        geometry = markShared(new SphereGeometry(radius, 24, 16));
        geometries.set(radius, geometry);
    }
    return geometry;
}

/** A wooden ball. Dynamic by default: tanks can push it and it rolls around. */
class Ball extends Entity {
    private readonly _options: BallOptions;
    private readonly _radius: number;

    constructor(position: Vector3, options: BallOptions = {}) {
        super(position);
        this._options = { dynamic: true, ...options };
        this._radius = options.radius ?? DEFAULT_RADIUS;
        applyPropOptions(this, this._options);
    }

    public async load(): Promise<void> {
        const texture: Texture = this._options.texture ?? ResourceManager.instance.getRandomWallTexture();
        this.setMesh(new Mesh(geometryFor(this._radius), materialFor(texture)));
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        this.collider = new Sphere(this.position.clone(), this._radius);

        const dynamic = this._options.dynamic ?? true;
        const volume = (4 / 3) * Math.PI * this._radius ** 3;
        const body = this.createBody({
            mass: dynamic ? this._options.mass ?? volume * WOOD_DENSITY : 0,
            material: dynamic ? PhysicsMaterials.prop : PhysicsMaterials.scenery,
            linearDamping: 0.1,
            angularDamping: 0.3, // Rolls out instead of rolling forever
        });
        body.addShape(new SphereShape(this._radius));
    }
}

export default Ball;
