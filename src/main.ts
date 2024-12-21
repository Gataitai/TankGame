import './style.css';
import GameScene from "./scene/GameScene.ts";

async function main() {
    try {
        await GameScene.instance.load();
        GameScene.instance.render();
    } catch (error) {
        console.error("Error during game initialization:", error);
    }
}

main();
