import { DirectionalLight, Scene, Vector3 } from "three";
import LightIndicator from "@/entities/lights/LightIndicator";

type LightConfig = {
    color: number;
    position: (mapSize: number) => [number, number, number];
    castShadow?: boolean;
};

const LIGHTS: LightConfig[] = [
    { color: 0xff00ae, position: (s) => [s + 10, -10, 20] },
    { color: 0xffd6da, position: (s) => [0, s, 10] },
    { color: 0x00d0ff, position: () => [-10, -10, 20], castShadow: true },
    { color: 0xffd6da, position: (s) => [s, s, 10] },
    { color: 0x413696, position: () => [0, 0, 10] },
    { color: 0x94348a, position: (s) => [s, 0, 10] },
];

class LightingManager {
    private _shadowLight: DirectionalLight | null = null;
    /** Where the shadow light is relative to the point it shines at. */
    private readonly _shadowOffset = new Vector3();

    /** Adds the lights to the scene and returns indicator entities to visualise them. */
    public setupLights(scene: Scene, mapSize: number): LightIndicator[] {
        return LIGHTS.map(({ color, position, castShadow }) => {
            const light = new DirectionalLight(color, 1);
            light.position.set(...position(mapSize));

            if (castShadow) {
                // Directional lights shine from their position towards their target (the origin)
                this._shadowLight = light;
                this._shadowOffset.copy(light.position).sub(light.target.position);
                scene.add(light.target);
                light.castShadow = true;
                light.shadow.mapSize.set(2048, 2048);
                light.shadow.camera.left = -30;
                light.shadow.camera.right = 30;
                light.shadow.camera.top = 30;
                light.shadow.camera.bottom = -30;
                light.shadow.bias = -0.0001;
            }

            scene.add(light);
            return new LightIndicator(light.position, color);
        });
    }

    /**
     * Shadows are only rendered in a limited area around the shadow light's target. Moving the
     * light along (same direction) keeps the area around `point` covered on big maps.
     */
    public centerShadowsOn(point: Vector3): void {
        if (!this._shadowLight) return;
        this._shadowLight.target.position.set(point.x, point.y, 0);
        this._shadowLight.position.copy(this._shadowLight.target.position).add(this._shadowOffset);
    }
}

export default LightingManager;
