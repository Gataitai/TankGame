import { Vector3 } from "three";
import Wall from "@/map/Wall";
import BreakableWall from "@/map/BreakableWall";
import { buildMapBase, uniquePositions } from "@/map/MapBuilder";
import PlayerTank from "@/entities/tanks/PlayerTank";
import BasicEnemyTank from "@/entities/tanks/BasicEnemyTank";
import TacticalEnemyTank from "@/entities/tanks/TacticalEnemyTank";
import type Scene from "@/scene/Scene";
import { ENEMY_AI, WALL_Z } from "@/config";

/**
 * Obstacle layouts, one per level (cycling). Each 5x5 pattern is stretched over the map;
 * neighbouring X's are connected with continuous walls.
 */
const OBSTACLE_PATTERNS: string[][] = [
    [
        "     ",
        " X X ",
        " XXX ",
        " X X ",
        "     ",
    ],
    [
        " X X ",
        " X X ",
        "     ",
        " X X ",
        " X X ",
    ],
    [
        "     ",
        " XXX ",
        " X X ",
        " XXX ",
        "     ",
    ],
    [
        "     ",
        "  XX ",
        "  X  ",
        " XX  ",
        "     ",
    ],
];

const BREAKABLE_WALL_CHANCE = 0.5;

/** Knows the level layouts and builds them into a scene. Tracks the current level. */
class LevelManager {
    private _level = 1;

    public get level(): number {
        return this._level;
    }

    public advance(): void {
        this._level++;
    }

    public reset(): void {
        this._level = 1;
    }

    /** Builds the current level: map, obstacles, the player and the enemies. */
    public async build(scene: Scene): Promise<void> {
        const size = scene.mapSize;
        const EnemyClass = ENEMY_AI === "tactical" ? TacticalEnemyTank : BasicEnemyTank;
        const enemyStarts = [
            new Vector3(size - 4, 3, 0),
            new Vector3(3, size - 4, 0),
            new Vector3(size - 4, size - 4, 0),
        ];

        await Promise.all([
            buildMapBase(scene),
            ...this.obstaclePositions(size).map((position) =>
                scene.add(Math.random() < BREAKABLE_WALL_CHANCE ? new BreakableWall(position) : new Wall(position))),
            scene.add(new PlayerTank(new Vector3(3, 3, 0))),
            ...enemyStarts.map((position) => scene.add(new EnemyClass(position))),
        ]);
    }

    private obstaclePositions(mapSize: number): Vector3[] {
        const pattern = OBSTACLE_PATTERNS[(this._level - 1) % OBSTACLE_PATTERNS.length];
        const patternSize = pattern.length;
        const gridSize = mapSize + 4;
        const scaleFactor = gridSize / patternSize;
        const offset = Math.floor((gridSize - patternSize * scaleFactor) / 2) + 1;
        const edge = mapSize - 1;
        const isWall = (x: number, y: number) => pattern[y]?.[x] === "X";

        const positions: Vector3[] = [];
        const place = (x: number, y: number) => {
            const px = offset + x;
            const py = offset + y;
            // Never put obstacles on top of (or outside) the border
            if (px <= 0 || py <= 0 || px >= edge || py >= edge) return;
            positions.push(new Vector3(px, py, WALL_Z));
        };

        for (let y = 0; y < patternSize; y++) {
            for (let x = 0; x < patternSize; x++) {
                if (!isWall(x, y)) continue;

                const scaledX = Math.floor(x * scaleFactor);
                const scaledY = Math.floor(y * scaleFactor);
                place(scaledX, scaledY);

                // Fill the gap towards connected neighbours
                if (isWall(x + 1, y)) {
                    for (let step = 1; step < scaleFactor; step++) place(scaledX + step, scaledY);
                }
                if (isWall(x, y + 1)) {
                    for (let step = 1; step < scaleFactor; step++) place(scaledX, scaledY + step);
                }
            }
        }

        // Filling gaps can produce the same tile twice, which used to stack two walls
        return uniquePositions(positions);
    }
}

export default LevelManager;
