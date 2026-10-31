import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { Palette } from "@2/render/Materials";

/** Where the weapon sits in camera space: to the lower right, pointing away along -Z. */
const REST_POSITION = new Vector3(0.26, -0.2, -0.35);

/** How quickly the weapon slides back to its resting place after a shot. */
const RECOIL_RECOVERY = 14;

// Lit like the rest of the sandbox, with a little emissive so the thing in your hands stays
// readable when you walk through a shadow.
const FRAME_MATERIAL = new MeshStandardMaterial({
    color: Palette.white,
    emissive: 0x20242a,
    roughness: 0.55,
});
const ACCENT_MATERIAL = new MeshStandardMaterial({
    color: Palette.orange,
    emissive: 0x2a1405,
    roughness: 0.6,
});

type Vec3Tuple = [number, number, number];

/** One weapon's blocks, plus the point its shots appear to come from. */
type Model = {
    root: Group;
    muzzle: Object3D;
};

/**
 * The weapon you see in front of you, built from a couple of boxes. It lives in camera space (it is
 * attached to the camera, see CameraManager.viewRoot), not in the world, so it is not an entity.
 *
 * The models are in the same order as the holder's weapon strategies, so one index selects both
 * (see PlayerControl).
 */
class ViewModel {
    private readonly _root = new Group();
    private readonly _models: Model[] = [];
    private readonly _geometries: BoxGeometry[] = [];
    private _recoil = 0;

    constructor() {
        this._root.position.copy(REST_POSITION);
        this._models.push(this.buildGun(), this.buildLauncher());
        this.select(0);
    }

    /** Add this to the camera to hold the weapon. */
    public get object(): Object3D {
        return this._root;
    }

    /** Shows the model belonging to the weapon at `index` and hides the others. */
    public select(index: number): void {
        this._models.forEach((model, i) => (model.root.visible = i === index));
    }

    /** Pushes the weapon backwards; `amount` is in world units. */
    public kick(amount: number): void {
        this._recoil = Math.max(this._recoil, amount);
    }

    public update(deltaT: number): void {
        this._recoil *= Math.exp(-RECOIL_RECOVERY * deltaT);
        if (this._recoil < 0.0005) this._recoil = 0;
        this._root.position.z = REST_POSITION.z + this._recoil;
    }

    /** The muzzle of the weapon that's currently out, in world space. */
    public muzzleWorldPosition(index: number, target = new Vector3()): Vector3 {
        const muzzle = this._models[index].muzzle;
        // World matrices are only refreshed at render time, so update this one's chain (up to and
        // including the camera) before reading it.
        muzzle.updateWorldMatrix(true, false);
        return target.setFromMatrixPosition(muzzle.matrixWorld);
    }

    public dispose(): void {
        this._geometries.forEach((geometry) => geometry.dispose());
        this._geometries.length = 0;
        this._root.clear();
        this._root.removeFromParent();
    }

    // ---- Models --------------------------------------------------------------------------

    /** Body plus barrel. */
    private buildGun(): Model {
        const root = new Group();
        root.add(this.block(FRAME_MATERIAL, [0.075, 0.11, 0.22], [0, 0, 0]));
        root.add(this.block(ACCENT_MATERIAL, [0.045, 0.045, 0.3], [0, 0.03, -0.24]));
        return this.register(root, [0, 0.03, -0.4]);
    }

    /** Tube plus grip. */
    private buildLauncher(): Model {
        const root = new Group();
        root.add(this.block(FRAME_MATERIAL, [0.11, 0.11, 0.85], [0, 0.02, -0.3]));
        root.add(this.block(ACCENT_MATERIAL, [0.06, 0.13, 0.09], [0, -0.08, -0.05]));
        return this.register(root, [0, 0.02, -0.74]);
    }

    private register(root: Group, muzzlePosition: Vec3Tuple): Model {
        const muzzle = new Object3D();
        muzzle.position.set(...muzzlePosition);
        root.add(muzzle);
        this._root.add(root);
        return { root, muzzle };
    }

    private block(material: MeshStandardMaterial, size: Vec3Tuple, position: Vec3Tuple): Mesh {
        const geometry = new BoxGeometry(...size);
        this._geometries.push(geometry);
        const mesh = new Mesh(geometry, material);
        mesh.position.set(...position);
        return mesh;
    }
}

export default ViewModel;
