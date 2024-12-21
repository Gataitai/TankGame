// LightingManager.ts
import { Scene, DirectionalLight, Vector3 } from "three";
import EntityManager from "@/scene/managers/EntityManager.ts";
import LightIndicator from "@/entities/lights/LightIndicator.ts";

class LightingManager {
    // Helper function to calculate color difference
    private getColorDifference(color1: number, color2: number): number {
        const r1 = (color1 >> 16) & 0xff;
        const g1 = (color1 >> 8) & 0xff;
        const b1 = color1 & 0xff;
        const r2 = (color2 >> 16) & 0xff;
        const g2 = (color2 >> 8) & 0xff;
        const b2 = color2 & 0xff;

        // Euclidean distance in RGB space
        return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
    }

    // Helper function to generate a random vibrant neon-like color
    private generateRandomColor(): number {
        const baseChannel = Math.floor(Math.random() * 3); // 0=Red, 1=Green, 2=Blue
        let r = 0, g = 0, b = 0;

        if (baseChannel === 0) r = 255;
        if (baseChannel === 1) g = 255;
        if (baseChannel === 2) b = 255;

        if (baseChannel !== 0) r = Math.floor(Math.random() * 150) + 50;
        if (baseChannel !== 1) g = Math.floor(Math.random() * 150) + 50;
        if (baseChannel !== 2) b = Math.floor(Math.random() * 150) + 50;

        return (r << 16) + (g << 8) + b;
    }

    // Helper function to ensure distinct colors
    private getDistinctColors(count: number): number[] {
        const colors: number[] = [];
        for (let i = 0; i < count; i++) {
            let color = this.generateRandomColor();

            let attempts = 0;
            while (
                attempts < 10 &&
                colors.some(existingColor => this.getColorDifference(color, existingColor) < 150)
                ) {
                color = this.generateRandomColor();
                attempts++;
            }

            colors.push(color);
        }
        return colors;
    }

    public setupLights(scene: Scene, entityManager: EntityManager, mapSize: number) {
        // Generate distinct colors for the lights
        const lightColors = this.getDistinctColors(6);

        // Create the directional lights
        const lights = lightColors.map(
            color => new DirectionalLight(color, Math.random() * 1.5 + 0.5)
        );

        // Define the positions for each light
        const lightPositions = [
            { x: mapSize + 10, y: -10, z: 20 },
            { x: 0, y: mapSize, z: 10 },
            { x: -10, y: -10, z: 20 },
            { x: mapSize, y: mapSize, z: 10 },
            { x: 0, y: 0, z: 10 },
            { x: mapSize, y: 0, z: 10 },
        ];

        // Configure lights and create indicators
        lights.forEach((light, index) => {
            const { x, y, z } = lightPositions[index];
            light.position.set(x, y, z);

            // Enable shadows for the third light if desired
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

            // Add a LightIndicator entity
            const indicator = new LightIndicator(new Vector3(x, y, z), light.color.getHex());
            entityManager.addEntity(indicator);
        });
    }
}

export default LightingManager;
