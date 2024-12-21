import { Vector3 } from "three";
import EntityManager from "@/scene/managers/EntityManager.ts";
import Wall from "@/map/Wall.ts";
import BreakableWall from "@/map/BreakableWall.ts";

class LevelManager {
    private _currentLevel: number = 1; // Track current level
    private _entityManager: EntityManager;

    private patterns: string[][][] = [
        [
            [" ", " ", " ", " ", " "],
            [" ", "X", " ", "X", " "],
            [" ", "X", "X", "X", " "],
            [" ", "X", " ", "X", " "],
            [" ", " ", " ", " ", " "],
        ],
        [
            [" ", "X", " ", "X", " "],
            ["X", "X", " ", "X", "X"],
            [" ", " ", " ", " ", " "],
            ["X", "X", " ", "X", "X"],
            [" ", "X", " ", "X", " "],
        ],
        [
            [" ", " ", "X", " ", " "],
            [" ", "X", "X", "X", " "],
            ["X", "X", " ", "X", "X"],
            [" ", "X", "X", "X", " "],
            [" ", " ", "X", " ", " "],
        ],
        [
            [" ", " ", " ", " ", " "],
            [" ", " ", "X", "X", " "],
            [" ", " ", "X", " ", " "],
            [" ", "X", "X", " ", " "],
            [" ", " ", " ", " ", " "],
        ],
    ];

    constructor(entityManager: EntityManager) {
        this._entityManager = entityManager;
    }

    public get currentLevel(): number {
        return this._currentLevel;
    }

    public set currentLevel(level: number) {
        this._currentLevel = level;
    }

    public incrementLevel(): void {
        this._currentLevel++;
    }

    public resetLevel(): void {
        this._currentLevel = 1;
    }

    public generateObstacles(mapSize: number): void {
        const patternIndex = (this._currentLevel - 1) % this.patterns.length;
        const selectedPattern = this.patterns[patternIndex];

        const patternSize = selectedPattern.length; // 5x5
        const gridSize = mapSize + 4;
        const scaleFactor = gridSize / patternSize;

        const offsetX = Math.floor((gridSize - patternSize * scaleFactor) / 2) + 1;
        const offsetY = Math.floor((gridSize - patternSize * scaleFactor) / 2) + 1;

        const placeWall = (x: number, y: number): void => {
            const position = new Vector3(offsetX + x, offsetY + y, 0.5);
            const isBreakable = Math.random() < 0.5;
            const wall = isBreakable ? new BreakableWall(position) : new Wall(position);
            this._entityManager.addEntity(wall);
        };

        for (let y = 0; y < patternSize; y++) {
            for (let x = 0; x < patternSize; x++) {
                if (selectedPattern[y][x] === "X") {
                    const scaledX = Math.floor(x * scaleFactor);
                    const scaledY = Math.floor(y * scaleFactor);

                    placeWall(scaledX, scaledY);

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

    public endLevel(won: boolean): void {
        // Dispose all entities
        for (let entity of this._entityManager.entities) {
            entity.shouldDispose = true;
        }
        this._entityManager.dispose();

        // Show alert
        if (won) {
            alert(`You won level ${this._currentLevel}!`);
            // Optionally go to next level
            this.incrementLevel();
        } else {
            alert(`You died on level ${this._currentLevel}.`);
            // Optionally reset level
            this.resetLevel();
        }
    }
}

export default LevelManager;
