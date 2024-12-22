import Entity from "@/entities/Entity.ts";
import { Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";
import Wall from "@/map/Wall.ts";
import BreakableWall from "@/map/BreakableWall.ts";
import GameScene from "@/scene/GameScene.ts";
import ResourceManager from "@/utils/ResourceManager.ts";
import TreadsCanvas from "@/map/TreadsCanvas.ts";

class GameMap extends Entity {
    private readonly _mapSize: number;

    constructor(position: Vector3, size: number) {
        super(position);
        this._mapSize = size;
    }

    public async load(): Promise<void> {
        const groundTexture = ResourceManager.instance.getTexture("ground");
        const geometry = new PlaneGeometry(44, 33);
        const material = new MeshStandardMaterial({
            map: groundTexture,
        });

        this.mesh = new Mesh(geometry, material);

        this.mesh.position.set(
            this.position.x + this._mapSize / 2,
            this.position.y + this._mapSize / 2,
            this.position.z
        );

        // Create the treads canvas overlay
        const treadsCanvas = new TreadsCanvas(this._mapSize, this.mesh.position);
        await treadsCanvas.load();
        GameScene.instance.addToScene(treadsCanvas);

        // Create the walls and obstacles
        this.createBorder();
        this.createObstacles();
    }

    // Create map borders using walls
    private createBorder(): void {
        const edge = this._mapSize - 1;

        GameScene.instance.addToScene(new Wall(new Vector3(edge, edge, 0.5)));

        for (let i = 0; i < edge; i++) {
            GameScene.instance.addToScene(new Wall(new Vector3(i, 0, 0.5)));
            GameScene.instance.addToScene(new Wall(new Vector3(0, i, 0.5)));
            GameScene.instance.addToScene(new Wall(new Vector3(edge, i, 0.5)));
            GameScene.instance.addToScene(new Wall(new Vector3(i, edge, 0.5)));
        }
    }

    // Generate obstacles on the map
    private createObstacles(): void {
        // Define obstacle patterns using 2D matrices
        const patterns = [
            [
                [" ", " ", " ", " ", " "],
                [" ", "X", " ", "X", " "],
                [" ", "X", "X", "X", " "],
                [" ", "X", " ", "X", " "],
                [" ", " ", " ", " ", " "],
            ],
            [
                [" ", "X", " ", "X", " "],
                [" ", "X", " ", "X", " "],
                [" ", " ", " ", " ", " "],
                [" ", "X", " ", "X", " "],
                [" ", "X", " ", "X", " "],
            ],
            [
                [" ", " ", " ", " ", " "],
                [" ", "X", "X", "X", " "],
                [" ", "X", " ", "X", " "],
                [" ", "X", "X", "X", " "],
                [" ", " ", " ", " ", " "],
            ],
            [
                [" ", " ", " ", " ", " "],
                [" ", " ", "X", "X", " "],
                [" ", " ", "X", " ", " "],
                [" ", "X", "X", " ", " "],
                [" ", " ", " ", " ", " "],
            ],
        ];

        // Randomly select a pattern
        const selectedPattern = patterns[Math.floor(Math.random() * patterns.length)];

        const patternSize = selectedPattern.length; // 5x5 pattern
        const gridSize = this._mapSize + 4; // Grid size excluding borders
        const scaleFactor = gridSize / patternSize; // Scale factor to stretch pattern to fit grid

        // Calculate offsets to center the pattern
        const offsetX = Math.floor((gridSize - patternSize * scaleFactor) / 2) + 1; // Horizontal offset
        const offsetY = Math.floor((gridSize - patternSize * scaleFactor) / 2) + 1; // Vertical offset

        // Helper function to place a wall or breakable wall
        const placeWall = (x: number, y: number): void => {
            const position = new Vector3(offsetX + x, offsetY + y, 0.5);
            const isBreakable = Math.random() < 0.5;
            const wall = isBreakable ? new BreakableWall(position) : new Wall(position);
            GameScene.instance.addToScene(wall);
        };

        // Traverse the pattern and scale it to fit the grid
        for (let y = 0; y < patternSize; y++) {
            for (let x = 0; x < patternSize; x++) {
                if (selectedPattern[y][x] === "X") {
                    const scaledX = Math.floor(x * scaleFactor);
                    const scaledY = Math.floor(y * scaleFactor);

                    placeWall(scaledX, scaledY);

                    // Check for connectivity and fill gaps
                    if (x < patternSize - 1 && selectedPattern[y][x + 1] === "X") {
                        for (let step = 1; step < scaleFactor; step++) {
                            placeWall(scaledX + step, scaledY);
                        }
                    }
                    if (y < patternSize - 1 && selectedPattern[y + 1][x] === "X") {
                        for (let step = 1; step < scaleFactor; step++) {
                            placeWall(scaledX, scaledY + step);
                        }
                    }
                }
            }
        }
    }
}

export default GameMap;
