import Wall from "@/map/Wall.ts";
import GameScene from "@/scene/GameScene.ts";
import ExplosionEffect from "@/effects/ExplosionEffect.ts";

class BreakableWall extends Wall {
    protected textureKey: string = "breakable-wall"; // Use the specific texture for breakable walls

    public destroy(): void {
        this.shouldDispose = true;

        // Trigger explosion effect on destroy
        const explosion = new ExplosionEffect(this.mesh.position, 2);
        explosion.load().then(() => {
            GameScene.instance.addToScene(explosion);
        });
    }
}

export default BreakableWall;
