import "./style.css";
import Game from "@/core/Game";
import GameScene from "@/scene/GameScene";
import GameScene2 from "@/scene/GameScene2";
import GameScene3 from "@/scene/GameScene3";
import GameScene4 from "@/scene/GameScene4";
import type Scene from "@/scene/Scene";
import InputManager from "@/scene/managers/InputManager";
import ResourceManager from "@/utils/ResourceManager";

/** The available scenes, in the order the N key cycles through them. */
const SCENES: { id: string; name: string; create: () => Scene }[] = [
    { id: "levels", name: "Level mode", create: () => new GameScene() },
    { id: "arena", name: "Arena mode", create: () => new GameScene2() },
    { id: "ball", name: "Ball arena", create: () => new GameScene3() },
    { id: "construction", name: "Construction site", create: () => new GameScene4() },
];

async function main(): Promise<void> {
    const container = document.querySelector<HTMLDivElement>("#app");
    if (!container) throw new Error("Unable to find #app element");

    const game = new Game(container);
    await ResourceManager.instance.load();

    // Start in the scene from the URL (?scene=arena), level mode by default
    const requested = new URLSearchParams(window.location.search).get("scene");
    let current = Math.max(0, SCENES.findIndex((scene) => scene.id === requested));
    await game.loadScene(SCENES[current].create());
    game.start();

    // N switches to the next scene
    InputManager.instance.onKeyDown("KeyN", async () => {
        if (game.isLoading) return;
        current = (current + 1) % SCENES.length;
        await game.loadScene(SCENES[current].create());
        game.hud.flash(SCENES[current].name);
    });
}

main().catch((error) => console.error("Error during game initialization:", error));
