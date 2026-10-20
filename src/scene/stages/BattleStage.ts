import { Vector3 } from "three";
import Entity from "@/entities/Entity";
import Wall from "@/map/Wall";
import BreakableWall from "@/map/BreakableWall";
import PlayerTank from "@/entities/tanks/PlayerTank";
import EnemyTank from "@/entities/tanks/EnemyTank";
import BasicEnemyTank from "@/entities/tanks/BasicEnemyTank";
import TacticalEnemyTank from "@/entities/tanks/TacticalEnemyTank";
import type Stage from "@/scene/stages/Stage";
import type { Spawn, StageEntities } from "@/scene/stages/Stage";
import { buildArena, uniquePositions } from "@/scene/stages/Arena";
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

/**
 * The game itself: destroy every enemy tank to get to the next level; when the player is destroyed
 * it starts over at level 1.
 */
class BattleStage implements Stage {
    public readonly name = "Battle";
    private _level = 1;

    public get title(): string {
        return `Level ${this._level}`;
    }

    public async build(spawn: Spawn, mapSize: number): Promise<StageEntities> {
        const { treads, pending } = buildArena(spawn, mapSize);

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

    public isCleared(entities: readonly Entity[]): boolean {
        return !entities.some((entity) => entity instanceof EnemyTank && !entity.shouldDispose);
    }

    public onCleared(): string {
        const message = `Level ${this._level} cleared!`;
        this._level++;
        return message;
    }

    public onFailed(): string {
        const message = `Destroyed on level ${this._level}`;
        this._level = 1;
        return message;
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

export default BattleStage;
