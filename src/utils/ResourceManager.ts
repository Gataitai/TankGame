import { Mesh, Texture, TextureLoader } from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { markShared } from "@/utils/SharedResources";
import { randomElement } from "@/utils/MathUtils";

const TEXTURES: Record<string, string> = {
    "ground": "textures/ground.png",
    "breakable-wall": "textures/wall0.png",
    "death-mark": "textures/death_mark0.png",
};

const WALL_TEXTURES = [1, 2, 3, 4, 5, 6].map((i) => `textures/wall${i}.png`);

const MODELS: Record<string, string> = {
    "tank": "models/tank_player.glb",
};

class ResourceManager {
    private static _instance = new ResourceManager();
    public static get instance() {
        return this._instance;
    }

    private _textures = new Map<string, Texture>();
    private _wallTextures: Texture[] = [];
    private _models = new Map<string, GLTF>();

    private constructor() {}

    /** Loads every texture and model in parallel. Everything returned from here is shared. */
    public async load(): Promise<void> {
        const textureLoader = new TextureLoader();
        const modelLoader = new GLTFLoader();

        const loadTexture = async (url: string) => markShared(await textureLoader.loadAsync(url));

        await Promise.all([
            ...Object.entries(TEXTURES).map(async ([key, url]) => {
                this._textures.set(key, await loadTexture(url));
            }),
            Promise.all(WALL_TEXTURES.map(loadTexture)).then((textures) => {
                this._wallTextures = textures;
            }),
            ...Object.entries(MODELS).map(async ([key, url]) => {
                const gltf = await modelLoader.loadAsync(url);
                // Clones of the model share its geometry, so never let an entity dispose it.
                gltf.scene.traverse((child) => {
                    if ((child as Mesh).isMesh) markShared((child as Mesh).geometry);
                });
                this._models.set(key, gltf);
            }),
        ]);

        // Premultiplied alpha avoids dark outlines around the decal's soft edges.
        this.getTexture("death-mark").premultiplyAlpha = true;
    }

    public getTexture(name: string): Texture {
        const texture = this._textures.get(name);
        if (!texture) throw new Error(`Texture "${name}" is not loaded`);
        return texture;
    }

    public getModel(name: string): GLTF {
        const model = this._models.get(name);
        if (!model) throw new Error(`Model "${name}" is not loaded`);
        return model;
    }

    public getRandomWallTexture(): Texture {
        return randomElement(this._wallTextures);
    }
}

export default ResourceManager;
