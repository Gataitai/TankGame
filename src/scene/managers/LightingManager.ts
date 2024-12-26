// LightingManager.ts
import { DirectionalLight, Scene, Vector3 } from "three";
import EntityManager from "@/scene/managers/EntityManager.ts";
import LightIndicator from "@/entities/lights/LightIndicator.ts";

// Extended palette (without # symbols)
const colorPalettes = [
    [
        "ff00ae",  // high right
        "ffd6da",  // Color 2
        "00d0ff",  // high left ff00ae
        "ffd6da",  // Color 4
        "413696",  // Repeated Color 1
        "94348a"   // Repeated Color 3
    ]
];

class LightingManager {
    public setupLights(scene: Scene, entityManager: EntityManager, mapSize: number) {
        // Use the first palette (already extended to 6 colors)
        const baseColors = colorPalettes[0];

        // Convert hex strings directly to integers
        const lightColors = baseColors.map(color => parseInt(color, 16));

        const lights = lightColors.map(
            color => new DirectionalLight(color, 1)
        );

        const lightPositions = [
            { x: mapSize + 10, y: -10, z: 20 },  // Position 1
            { x: 0, y: mapSize, z: 10 },         // Position 2
            { x: -10, y: -10, z: 20 },           // Position 3
            { x: mapSize, y: mapSize, z: 10 },   // Position 4
            { x: 0, y: 0, z: 10 },               // Position 5
            { x: mapSize, y: 0, z: 10 },         // Position 6
        ];

        lights.forEach((light, index) => {
            const { x, y, z } = lightPositions[index];
            light.position.set(x, y, z);

            // Enable shadows for the third light
            if (index === 2) {
                light.castShadow = true;
                light.shadow.mapSize.width = 2048;
                light.shadow.mapSize.height = 2048;
                light.shadow.camera.left = -30;
                light.shadow.camera.right = 30;
                light.shadow.camera.top = 30;
                light.shadow.camera.bottom = -30;
                light.shadow.bias = -0.0001;
            }

            scene.add(light);

            // Create and add light indicator to the entity manager
            const indicator = new LightIndicator(new Vector3(x, y, z), light.color.getHex());
            entityManager.addEntity(indicator);
        });
    }
}

export default LightingManager;
