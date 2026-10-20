import { Vector3 } from "three";
import Entity from "@/entities/Entity";
import Ball from "@/entities/props/Ball";
import Block from "@/entities/props/Block";
import Ramp, { type RampDirection } from "@/entities/props/Ramp";
import PlayerTank from "@/entities/tanks/PlayerTank";
import TargetTank from "@/entities/tanks/TargetTank";
import BreakableWall from "@/map/BreakableWall";
import Wall from "@/map/Wall";
import type Stage from "@/scene/stages/Stage";
import type { Spawn, StageEntities } from "@/scene/stages/Stage";
import { buildArena } from "@/scene/stages/Arena";

/** Everything in the playground breaks when shot. */
const FRAGILE = { fragile: true } as const;
const DYNAMIC = { dynamic: true, fragile: true } as const;

/** The parkour runs along these two rows (two tiles wide). */
const PARKOUR_ROWS = [19, 20];
/** The jump's take-off ramps sit in these columns. */
const JUMP_COLUMNS = [20, 21];

/**
 * A sandbox without enemy AI for trying out the physics:
 * - a parkour of ramps and blocks to drive up, over and down again,
 * - a jump ramp to fly off,
 * - loose balls, crates, walls, dominoes and a pyramid to push around and knock over,
 * - glass walls, and two target tanks that don't fight back.
 * Everything breaks into pieces when shot.
 */
class PlaygroundStage implements Stage {
    public readonly name = "Physics playground";
    public readonly title = "Physics playground";

    public async build(spawn: Spawn, mapSize: number): Promise<StageEntities> {
        const { treads, pending } = buildArena(spawn, mapSize);
        const add = (entity: Entity) => pending.push(spawn(entity));

        this.buildParkour(add);
        this.buildJump(add);
        this.buildToys(add);

        const player = spawn(new PlayerTank(new Vector3(3, 3, 0)));
        await Promise.all(pending);
        return { player: await player, treads: await treads };
    }

    public isCleared(): boolean {
        return false; // Nothing to win here
    }

    public onCleared(): string {
        return "";
    }

    public onFailed(): string {
        return "Destroyed! Rebuilding the playground";
    }

    /**
     * Up a ramp onto a platform of blocks (height 1), up another ramp on top of it (height 2), then
     * down two ramps back to the ground. Drive in from the left at the top of the map.
     */
    private buildParkour(add: (entity: Entity) => void): void {
        const block = (x: number, y: number, level: number) => add(new Wall(new Vector3(x, y, level + 0.5), FRAGILE));
        const ramp = (x: number, y: number, level: number, rise: RampDirection) =>
            add(new Ramp(new Vector3(x, y, level), { rise, ...FRAGILE }));

        for (const y of PARKOUR_ROWS) {
            ramp(3.5, y, 0, "+x"); // Up to height 1 (x 3-4)
            for (let x = 5; x <= 12; x++) block(x, y, 0); // Platform at height 1 (x 5-12)
            ramp(6.5, y, 1, "+x"); // Up to height 2 (x 6-7)
            block(8, y, 1); // Platform at height 2 (x 8-9)
            block(9, y, 1);
            ramp(10.5, y, 1, "-x"); // Down to height 1 (x 10-11)
            ramp(13.5, y, 0, "-x"); // Down to the ground (x 13-14)
        }
    }

    /** A take-off ramp at the top right. Drive down (towards the bottom of the screen) over it at full speed. */
    private buildJump(add: (entity: Entity) => void): void {
        for (const x of JUMP_COLUMNS) {
            add(new Ramp(new Vector3(x, 19.5, 0), { rise: "-y", ...FRAGILE }));
        }
    }

    private buildToys(add: (entity: Entity) => void): void {
        // Pyramid of loose walls to knock over
        for (const x of [18, 19, 20]) add(new Wall(new Vector3(x, 3, 0.5), DYNAMIC));
        for (const x of [18.5, 19.5]) add(new Wall(new Vector3(x, 3, 1.5), DYNAMIC));
        add(new Wall(new Vector3(19, 3, 2.5), DYNAMIC));

        // Dominoes: push the first one (on the left) over
        const domino = new Vector3(0.25, 1, 1.6);
        for (let x = 10; x <= 17; x++) {
            add(new Block(new Vector3(x, 7, domino.z / 2), { size: domino, ...DYNAMIC }));
        }

        // Balls and crates
        for (const [x, y] of [[7, 5], [8.5, 8], [5, 10]]) {
            add(new Ball(new Vector3(x, y, 0.4), DYNAMIC));
        }
        const crate = new Vector3(0.8, 0.8, 0.8);
        for (const [x, y] of [[12, 3], [14, 4.5], [5, 7]]) {
            add(new Block(new Vector3(x, y, crate.z / 2), { size: crate, ...DYNAMIC }));
        }

        // A row of loose walls to bulldoze, and a loose ramp
        for (const x of [12, 13, 14]) add(new Wall(new Vector3(x, 13, 0.5), DYNAMIC));
        add(new Ramp(new Vector3(9, 11, 0), { rise: "+y", ...DYNAMIC }));

        // Glass walls to shoot
        for (let x = 4; x <= 8; x++) add(new BreakableWall(new Vector3(x, 14, 0.5), FRAGILE));

        // Tanks that don't fight back
        add(new TargetTank(new Vector3(12, 10, 0), Math.PI / 4));
        add(new TargetTank(new Vector3(16, 16, 0), -Math.PI / 2));
    }
}

export default PlaygroundStage;
