import { Material, Texture } from "three";
import { markShared } from "@/utils/SharedResources";

/**
 * The materials of one shattered object, shared by all its pieces. They're marked as shared so
 * a single piece doesn't free them; they're freed when the last piece is gone.
 */
class FragmentMaterials {
    private _users = 0;

    constructor(public readonly materials: Material[]) {
        materials.forEach((material) => markShared(material));
    }

    public retain(): void {
        this._users++;
    }

    public release(): void {
        if (--this._users > 0) return;
        for (const material of this.materials) {
            for (const value of Object.values(material)) {
                if (value instanceof Texture && value.userData?.ownedByFragments) value.dispose();
            }
            material.dispose();
        }
    }
}

export default FragmentMaterials;
