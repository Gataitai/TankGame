import { Texture, Vector3 } from "three";
import Wall from "@/map/Wall";
import ExplosionEffect from "@/effects/ExplosionEffect";
import ResourceManager from "@/utils/ResourceManager";
import type { Impact } from "@/physics/ObjectBreaker";

class BreakableWall extends Wall {
    constructor(position: Vector3) {
        super(position);
        this.breakSettings = { pieces: 10, lifetime: 4 };
    }

    /** Blows the wall up: it shatters into pieces that disappear after a while. Safe to call more than once. */
    public destroy(impact?: Impact): void {
        if (this.shouldDispose) return;
        void this.scene.add(new ExplosionEffect(this.position, 2));
        this.break(impact);
    }

    protected getTexture(): Texture {
        return ResourceManager.instance.getTexture("breakable-wall");
    }
}

export default BreakableWall;
