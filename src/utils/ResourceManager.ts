import { Texture, TextureLoader } from "three";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

class ResourceManager {
    private static _instance = new ResourceManager();
    public static get instance() {
        return this._instance;
    }

    private constructor() {}

    private _wallTextures: Texture[] = [];
    private _models = new Map<string, GLTF>();
    private _textures = new Map<string, Texture>();

    public getModel(modelName: string): GLTF | undefined {
        return this._models.get(modelName);
    }

    public getTexture(textureName: string): Texture | undefined {
        return this._textures.get(textureName);
    }

    // Load entry point
    public load = async () => {
        const textureLoader = new TextureLoader();
        await this.loadBreakableWallTexture(textureLoader);
        await this.loadWallTextures(textureLoader);
        await this.loadGroundTexture(textureLoader);
        await this.loadTankTextures(textureLoader);
        await this.loadDeathMarkTextures(textureLoader);
        await this.loadModels();
    };

    private loadModels = async () => {
        // Instance of model loader
        const modelLoader = new GLTFLoader();
        const playerTank = await modelLoader.loadAsync("models/tank_player.glb")
        this._models.set("player", playerTank);
    };

    private loadTankTextures = async (textureLoader: TextureLoader) => {
        // Player tank
        const tankTexture = await textureLoader.loadAsync("textures/tank_texture_blue.png");

        // Add to the game resources
        this._textures.set("tank_blue", tankTexture);
    };

    private loadDeathMarkTextures = async (textureLoader: TextureLoader) => {
        const redDeathMark = await textureLoader.loadAsync("textures/death_mark0.png");
        const whiteDeathMark = await textureLoader.loadAsync("textures/death_mark1.png");
        const blueDeathMark = await textureLoader.loadAsync("textures/death_mark2.png");

        this._textures.set("death_mark_red", redDeathMark);
        this._textures.set("death_mark_white", whiteDeathMark);
        this._textures.set("death_mark_blue", blueDeathMark);

    }

    private loadGroundTexture = async (textureLoader: TextureLoader) => {
        // Load the ground texture
        const groundTexture = await textureLoader.loadAsync("textures/ground.png");
        this._textures.set("ground", groundTexture);
    };

    private loadBreakableWallTexture = async (textureLoader: TextureLoader) => {
        // Load the breakable wall texture (wall0.png)
        const breakableWallTexture = await textureLoader.loadAsync("textures/wall0.png");
        this._textures.set("breakable-wall", breakableWallTexture);
    };

    private loadWallTextures = async (textureLoader: TextureLoader) => {
        const wallTextureFiles = [
            "wall1.png",
            "wall2.png",
            "wall3.png",
            "wall4.png",
            "wall5.png",
            "wall6.png",
        ];

        // Load the wall textures
        for (const fileName of wallTextureFiles) {
            const texture = await textureLoader.loadAsync(`textures/${fileName}`);
            this._wallTextures.push(texture);
        }

        // Load the bevel normal map and store it in the textures map
        const bevelNormalMap = await textureLoader.loadAsync("textures/bevel_normal_map.png");
        this._textures.set("bevel-normal-map", bevelNormalMap);
    };


    public getRandomWallTexture = (): Texture => {
        // Return a random texture for regular walls
        return this._wallTextures[
            Math.floor(Math.random() * this._wallTextures.length)
            ];
    };
}

export default ResourceManager;
