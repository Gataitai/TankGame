import { Texture } from "three";
import Wall from "@/map/Wall";
import ExplosionEffect from "@/effects/ExplosionEffect";
import GameScene from "@/scene/GameScene";
import ResourceManager from "@/utils/ResourceManager";

class BreakableWall extends Wall {
    /** Blows the wall up. Safe to call more than once. */
    public destroy(): void {
        if (this.shouldDispose) return;
        this.shouldDispose = true;
        void GameScene.instance.spawn(new ExplosionEffect(this.position, 2));
    }

    protected getTexture(): Texture {
        return ResourceManager.instance.getTexture("breakable-wall");
    }
}

export default BreakableWall;
