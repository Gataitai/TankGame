import { Vector3 } from "three";
import Entity from "@/entities/Entity";
import Wall from "@/map/Wall";
import BreakableWall from "@/map/BreakableWall";
import GameMap from "@/map/GameMap";
import TreadsCanvas from "@/map/TreadsCanvas";
import PlayerTank from "@/entities/tanks/PlayerTank";
import BasicEnemyTank from "@/entities/tanks/BasicEnemyTank";
import TacticalEnemyTank from "@/entities/tanks/TacticalEnemyTank";
import { ENEMY_AI, WALL_Z } from "@/config";

type Spawn = <T extends Entity>(entity: T) => Promise<T>;

export type LevelEntities = {
    player: PlayerTank;
    treads: TreadsCanvas;
};

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

/** Builds levels: ground, treads overlay, border, obstacles and tanks. Tracks the current level. */
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

    public async build(spawn: Spawn, mapSize: number): Promise<LevelEntities> {
        const center = new Vector3(mapSize / 2, mapSize / 2, 0);
        const pending: Promise<unknown>[] = [];

        pending.push(spawn(new GameMap(center)));
        const treads = spawn(new TreadsCanvas(mapSize, center));

        for (const position of this.borderPositions(mapSize)) {
            pending.push(spawn(new Wall(position)));
        }
        for (const position of this.obstaclePositions(mapSize)) {
            const wall = Math.random() < BREAKABLE_WALL_CHANCE ? new BreakableWall(position) : new Wall(position);
            pending.push(spawn(wall));
        }

        const player = spawn(new PlayerTank(new Vector3(3, 3, 0)));
        const enemyStarts = [
            new Vector3(mapSize - 4, 3, 0),
            new Vector3(3, mapSize - 4, 0),
            new Vector3(mapSize - 4, mapSize - 4, 0),
        ];
        const EnemyClass = ENEMY_AI === "tactical" ? TacticalEnemyTank : BasicEnemyTank;
        for (const position of enemyStarts) {
            pending.push(spawn(new EnemyClass(position)));
        }

        await Promise.all(pending);
        return { player: await player, treads: await treads };
    }

    private borderPositions(mapSize: number): Vector3[] {
        const edge = mapSize - 1;
        const positions = [new Vector3(edge, edge, WALL_Z)];
        for (let i = 0; i < edge; i++) {
            positions.push(
                new Vector3(i, 0, WALL_Z),
                new Vector3(0, i, WALL_Z),
                new Vector3(edge, i, WALL_Z),
                new Vector3(i, edge, WALL_Z)
            );
        }
        // (0,0) is generated twice by the loop above; keep each tile once
        return this.unique(positions);
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
        return this.unique(positions);
    }

    private unique(positions: Vector3[]): Vector3[] {
        const seen = new Set<string>();
        return positions.filter((p) => {
            const key = `${p.x},${p.y}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }
}

export default LevelManager;
