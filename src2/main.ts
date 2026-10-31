import "./style.css";
import World from "./scene/World";

async function main() {
    try {
        await World.instance.load();
        World.instance.render();
    } catch (error) {
        console.error("Error during initialization:", error);
    }
}

main();
