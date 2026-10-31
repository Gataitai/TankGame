import { Vector3 } from "three";
import Entity from "@/entities/Entity";
import Ball from "@/entities/props/Ball";
import Block from "@/entities/props/Block";
import Ramp, { type RampDirection } from "@/entities/props/Ramp";
import PlayerTank from "@/entities/tanks/PlayerTank";
import EnemyTank from "@/entities/tanks/EnemyTank";
import BasicEnemyTank from "@/entities/tanks/BasicEnemyTank";
import TacticalEnemyTank from "@/entities/tanks/TacticalEnemyTank";
import BreakableWall from "@/map/BreakableWall";
import Wall from "@/map/Wall";
import type Stage from "@/scene/stages/Stage";
import type { Spawn, StageEntities } from "@/scene/stages/Stage";
import { buildArena } from "@/scene/stages/Arena";
import { randomIntInRange } from "@/utils/MathUtils";
import { ENEMY_AI } from "@/config";

const MAP_SIZE = 64;
const PLAYER_START = new Vector3(5, 5, 0);

/** Enemies in the first round; every cleared round adds more, up to the maximum. */
const FIRST_ROUND_ENEMIES = 6;
const ENEMIES_PER_ROUND = 2;
const MAX_ENEMIES = 14;
/** Enemies never start closer to the player than this. */
const SAFE_DISTANCE = 18;

/** Random wall segments scattered over the map. */
const WALL_SEGMENTS = 45;
const BREAKABLE_WALL_CHANCE = 0.4;

/** The parkour is built to last: missiles and mines break it, bullets don't. */
const STURDY = { destructible: true } as const;
/** Loose toys break from a single shot. */
const LOOSE = { dynamic: true, fragile: true } as const;

type Add = (entity: Entity) => void;

/**
 * A map much bigger than the screen; the camera follows the player. It has two parkours (one ends
 * in a big jump), a jump over a gap, scattered walls, loose toys to push around and enemy tanks
 * that hunt you. Clear them all for the next round, with more enemies.
 */
class BigMapStage implements Stage {
    public readonly name = "Big map";
    public readonly mapSize = MAP_SIZE;
    public readonly followCamera = true;
    private _round = 1;

    /** Tiles already used by something, so random walls don't end up on top of the parkour. */
    private readonly _occupied = new Set<string>();

    public get title(): string {
        return `Big map · Round ${this._round}`;
    }

    public async build(spawn: Spawn, mapSize: number): Promise<StageEntities> {
        const { treads, pending } = buildArena(spawn, mapSize);
        const add: Add = (entity) => pending.push(spawn(entity));
        this._occupied.clear();

        this.reserveArea(PLAYER_START.x, PLAYER_START.y, 3);
        this.buildTower(add, 8, 30);
        this.buildBridge(add, 30, 50);
        this.buildGapJump(add, 38, 20);
        this.buildBlockLoop(add, 42, 44);
        this.buildToys(add);
        const enemyStarts = this.pickEnemyStarts(mapSize);
        this.buildWalls(add, mapSize);

        const player = spawn(new PlayerTank(PLAYER_START.clone()));
        const EnemyClass = ENEMY_AI === "tactical" ? TacticalEnemyTank : BasicEnemyTank;
        for (const start of enemyStarts) add(new EnemyClass(start));

        await Promise.all(pending);
        return { player: await player, treads: await treads };
    }

    public isCleared(entities: readonly Entity[]): boolean {
        return !entities.some((entity) => entity instanceof EnemyTank && !entity.shouldDispose);
    }

    public onCleared(): string {
        const message = `Round ${this._round} cleared!`;
        this._round++;
        return message;
    }

    public onFailed(): string {
        const message = `Destroyed in round ${this._round}`;
        this._round = 1;
        return message;
    }

    // ---- Parkour -------------------------------------------------------------------------

    private block(add: Add, x: number, y: number, level: number): void {
        add(new Wall(new Vector3(x, y, level + 0.5), STURDY));
        this.occupy(x, y);
    }

    /** A 2-long ramp whose footprint is centred on (x, y), its bottom at `level`. */
    private ramp(add: Add, x: number, y: number, level: number, rise: RampDirection): void {
        add(new Ramp(new Vector3(x, y, level), { rise, ...STURDY }));
        const alongX = rise === "+x" || rise === "-x";
        this.occupy(alongX ? x - 0.5 : x, alongX ? y : y - 0.5);
        this.occupy(alongX ? x + 0.5 : x, alongX ? y : y + 0.5);
    }

    /**
     * A tower going up in steps to height 3, ending in a kicker ramp that launches the tank off
     * the top (2 tiles wide, driving towards +x from `x`).
     */
    private buildTower(add: Add, x: number, y: number): void {
        for (const row of [y, y + 1]) {
            this.ramp(add, x + 0.5, row, 0, "+x"); // Up to 1
            for (let i = 2; i <= 12; i++) this.block(add, x + i, row, 0);
            this.ramp(add, x + 3.5, row, 1, "+x"); // Up to 2
            for (let i = 5; i <= 12; i++) this.block(add, x + i, row, 1);
            this.ramp(add, x + 6.5, row, 2, "+x"); // Up to 3
            for (let i = 8; i <= 12; i++) this.block(add, x + i, row, 2);
            this.ramp(add, x + 11.5, row, 3, "+x"); // Kicker on top: off you go
        }
        // Keep the run-up and the landing zone clear of walls
        this.reserveArea(x - 2, y + 0.5, 2);
        this.reserveArea(x + 22, y, 6);
    }

    /** Up onto a long bridge (height 1, with a hump of height 2 in the middle) and down again. */
    private buildBridge(add: Add, x: number, y: number): void {
        for (const row of [y, y + 1]) {
            this.ramp(add, x + 0.5, row, 0, "+x"); // Up to 1
            for (let i = 2; i <= 17; i++) this.block(add, x + i, row, 0);
            this.ramp(add, x + 4.5, row, 1, "+x"); // Up to 2
            for (let i = 6; i <= 11; i++) this.block(add, x + i, row, 1);
            this.ramp(add, x + 12.5, row, 1, "-x"); // Down to 1
            this.ramp(add, x + 18.5, row, 0, "-x"); // Down to the ground
        }
        this.reserveArea(x - 2, y + 0.5, 2);
        this.reserveArea(x + 21, y + 0.5, 2);
    }

    /** Two ramps facing each other with a gap in between: jump it at full speed (along +x). */
    private buildGapJump(add: Add, x: number, y: number): void {
        for (const row of [y, y + 1]) {
            this.ramp(add, x + 0.5, row, 0, "+x"); // Take-off
            this.ramp(add, x + 9.5, row, 0, "-x"); // Landing
        }
        for (let i = -4; i <= 14; i++) this.reserveArea(x + i, y + 0.5, 1);
    }

    /**
     * A simple loop made of ordinary blocks and triangle ramps (no special code), 2 tiles wide:
     *
     *       ███████        ceiling (height 4)
     *       █◤   ◥█        upside-down triangles in the top corners
     *       █     █
     *       █     █
     *             ◢█       a triangle in the bottom right corner
     *    →  opening        drive in from the left (towards +x) under the left wall
     *
     * `x`: column of the left wall, `y`: the first of the two rows.
     */
    private buildBlockLoop(add: Add, x: number, y: number): void {
        const right = x + 6;
        const top = 4;
        const triangle = (tx: number, row: number, level: number, rise: RampDirection, upsideDown: boolean) => {
            add(new Ramp(new Vector3(tx, row, level), { rise, length: 1, upsideDown, ...STURDY }));
            this.occupy(tx, row);
        };

        for (const row of [y, y + 1]) {
            for (let level = 1; level <= top; level++) this.block(add, x, row, level); // Left wall, open at the bottom
            for (let level = 0; level <= top; level++) this.block(add, right, row, level); // Right wall
            for (let i = x + 1; i < right; i++) this.block(add, i, row, top); // Ceiling

            triangle(right - 1, row, 0, "+x", false); // Bottom right: up the wall
            triangle(right - 1, row, top - 1, "+x", true); // Top right: onto the ceiling
            triangle(x + 1, row, top - 1, "-x", true); // Top left: down the left wall
        }

        // Inside and the run-up stay free of walls
        for (let i = x - 8; i <= right + 2; i++) {
            for (let j = -1; j <= 2; j++) this.occupy(i, y + j);
        }
    }

    // ---- Toys ----------------------------------------------------------------------------

    private buildToys(add: Add): void {
        // A pyramid of loose walls
        const pyramid = (x: number, y: number) => {
            for (const dx of [0, 1, 2]) add(new Wall(new Vector3(x + dx, y, 0.5), LOOSE));
            for (const dx of [0.5, 1.5]) add(new Wall(new Vector3(x + dx, y, 1.5), LOOSE));
            add(new Wall(new Vector3(x + 1, y, 2.5), LOOSE));
            this.reserveArea(x + 1, y, 2);
        };
        pyramid(20, 8);
        pyramid(50, 38);

        // A line of dominoes
        const domino = new Vector3(0.25, 1, 1.6);
        for (let x = 12; x <= 22; x++) {
            add(new Block(new Vector3(x, 16, domino.z / 2), { size: domino, ...LOOSE }));
        }
        for (let x = 10; x <= 24; x++) this.reserveArea(x, 16, 1);

        // Balls and crates
        const crate = new Vector3(0.8, 0.8, 0.8);
        for (const [x, y] of [[10, 10], [27, 12], [44, 30], [56, 12], [14, 46], [33, 40], [52, 56]]) {
            add(new Ball(new Vector3(x, y, 0.4), LOOSE));
            add(new Block(new Vector3(x + 2, y + 1, crate.z / 2), { size: crate, ...LOOSE }));
            this.reserveArea(x + 1, y, 2);
        }

        // Glass walls
        for (let y = 36; y <= 42; y++) add(new BreakableWall(new Vector3(26, y, 0.5), { fragile: true }));
        for (let y = 35; y <= 43; y++) this.reserveArea(26, y, 1);
    }

    // ---- Walls and enemies ---------------------------------------------------------------

    /** Short straight walls in random places, never touching each other or the parkour. */
    private buildWalls(add: Add, mapSize: number): void {
        let placed = 0;
        for (let attempt = 0; attempt < WALL_SEGMENTS * 20 && placed < WALL_SEGMENTS; attempt++) {
            const length = randomIntInRange(2, 6);
            const horizontal = Math.random() < 0.5;
            const x0 = randomIntInRange(3, mapSize - 4 - (horizontal ? length : 0));
            const y0 = randomIntInRange(3, mapSize - 4 - (horizontal ? 0 : length));
            const tiles = Array.from({ length }, (_, i) => (horizontal ? [x0 + i, y0] : [x0, y0 + i]));

            // Leave a free tile around every segment, so nothing gets walled in
            if (tiles.some(([x, y]) => this.isAreaUsed(x, y, 1))) continue;

            const breakable = Math.random() < BREAKABLE_WALL_CHANCE;
            for (const [x, y] of tiles) {
                const position = new Vector3(x, y, 0.5);
                add(breakable ? new BreakableWall(position) : new Wall(position));
                this.occupy(x, y);
            }
            placed++;
        }
    }

    private pickEnemyStarts(mapSize: number): Vector3[] {
        const count = Math.min(MAX_ENEMIES, FIRST_ROUND_ENEMIES + (this._round - 1) * ENEMIES_PER_ROUND);
        const starts: Vector3[] = [];
        for (let attempt = 0; attempt < 500 && starts.length < count; attempt++) {
            const start = new Vector3(randomIntInRange(3, mapSize - 4), randomIntInRange(3, mapSize - 4), 0);
            if (start.distanceTo(PLAYER_START) < SAFE_DISTANCE || this.isAreaUsed(start.x, start.y, 1)) continue;
            if (starts.some((other) => other.distanceTo(start) < 6)) continue;
            starts.push(start);
            this.reserveArea(start.x, start.y, 2);
        }
        return starts;
    }

    // ---- Tile bookkeeping ----------------------------------------------------------------

    private occupy(x: number, y: number): void {
        this._occupied.add(`${Math.round(x)},${Math.round(y)}`);
    }

    private reserveArea(x: number, y: number, radius: number): void {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) this.occupy(x + dx, y + dy);
        }
    }

    private isAreaUsed(x: number, y: number, radius: number): boolean {
        for (let dx = -radius; dx <= radius; dx++) {
            for (let dy = -radius; dy <= radius; dy++) {
                if (this._occupied.has(`${Math.round(x + dx)},${Math.round(y + dy)}`)) return true;
            }
        }
        return false;
    }
}

export default BigMapStage;
