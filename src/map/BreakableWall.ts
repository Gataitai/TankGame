import { Texture, Vector3 } from "three";
import Wall from "@/map/Wall";
import type { PropOptions } from "@/entities/props/Block";
import type { Impact } from "@/entities/Entity";
import ExplosionEffect from "@/effects/ExplosionEffect";
import GameScene from "@/scene/GameScene";
import ResourceManager from "@/utils/ResourceManager";

/** Breaks into lots of small pieces, like glass. */
const SHARD_COUNT = 16;

/** A wall that missiles and mines can destroy. It shatters into pieces like glass. */
class BreakableWall extends Wall {
    constructor(position: Vector3, options: PropOptions = {}) {
        super(position, { ...options, destructible: true });
        this.shardCount = SHARD_COUNT;
    }

    protected onDestroyed(_impact: Impact): void {
        void GameScene.instance.spawn(new ExplosionEffect(this.position, 2));
    }

    protected getTexture(): Texture {
        return ResourceManager.instance.getTexture("breakable-wall");
    }
}

export default BreakableWall;
