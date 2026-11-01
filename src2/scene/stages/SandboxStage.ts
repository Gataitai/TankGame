import { Vector3 } from "three";
import type Stage from "@2/scene/stages/Stage";
import { spawnBall, spawnBlock, spawnGround, spawnRamp, type BlockOptions, type RampDirection } from "@2/prefabs/props";
import { Palette } from "@2/render/Materials";
import { BLOCK_Z, MAP_SIZE } from "@2/config";

/**
 * How the colours read (see render/Materials.ts):
 * - white  plain scenery, static and indestructible
 * - blue   solid structure: only an explosion brings it down
 * - red    fragile: a single bullet breaks it
 * - orange loose: push it, stack it, shoot it apart
 * - yellow landmarks, indestructible
 */
const PLAIN: BlockOptions = {};
const STURDY: BlockOptions = { color: Palette.blue, destructible: true };
const FRAGILE: BlockOptions = { color: Palette.red, fragile: true };
const LOOSE: BlockOptions = { color: Palette.orange, dynamic: true, fragile: true };
const LANDMARK: BlockOptions = { color: Palette.yellow };

/**
 * An open sandbox: no walls, so you can wander off in any direction over an endless floor. Things
 * to climb, things to knock over and things to blow up, spread far enough apart that you have to
 * walk between them. The tall yellow pillars are there to navigate by.
 *
 * Everything is placed on a 1x1x1 grid through claim(), which refuses to put two things in the
 * same cell. Two solid bodies sharing a cell start the frame overlapping, and the simulation's
 * only way out of that is to shove them apart hard — which looks like a stack spontaneously
 * exploding. The grid makes that impossible to introduce by accident.
 */
class SandboxStage implements Stage {
    public readonly name = "Sandbox";
    public readonly title = "Sandbox";
    public readonly mapSize = MAP_SIZE;
    public readonly playerStart = { x: 0, y: 0, yaw: Math.PI / 4 };

    /** Cells already in use, as "x,y,level". */
    private readonly _taken = new Set<string>();

    public build(): void {
        this._taken.clear();
        spawnGround(this.mapSize);

        this.landmarks();
        this.crateYard(10, 8);
        this.rampPlatform(-14, 6);
        this.staircase(6, -16);
        this.pyramid(-6, 16, Palette.orange);
        this.pyramid(18, -6, Palette.red);
        this.towers();
        this.dominoes(-18, -8, 14);
        this.dominoes(14, 18, 10);
        this.shootingGallery(22, 8);
        this.pillar(-20, 20, 2, 6);
        this.pillar(20, 24, 3, 8);
        this.bridge(-8, -22);
        this.balls();
        this.scatter();
    }

    // ---- Landmarks -----------------------------------------------------------------------

    /** Tall markers near the corners of the play area, so you can tell where you are. */
    private landmarks(): void {
        const d = this.mapSize / 2;
        for (const [x, y] of [[-d, -d], [-d, d], [d, -d], [d, d]]) {
            for (let level = 0; level < 10; level++) {
                this.block(x, y, level, LANDMARK);
            }
        }
    }

    // ---- Things to climb -----------------------------------------------------------------

    /** A ramp two tiles wide up onto a platform, and a ramp down the far side. */
    private rampPlatform(x: number, y: number): void {
        for (const row of [y, y + 1]) {
            this.ramp(x + 0.5, row, "+x");
            for (let i = 2; i <= 8; i++) this.block(x + i, row, 0, STURDY);
            this.ramp(x + 9.5, row, "-x");
        }
        // Something to find up there
        this.block(x + 4, y, 1, LOOSE);
        this.block(x + 6, y + 1, 1, LOOSE);
        this.ball(x + 7, y, 1, 0.4);
    }

    /** Blocks stepping up to height 4, two tiles wide. */
    private staircase(x: number, y: number): void {
        for (const row of [y, y + 1]) {
            for (let step = 0; step < 5; step++) {
                for (let level = 0; level <= step; level++) this.block(x + step, row, level, STURDY);
            }
            for (let i = 0; i < 4; i++) this.block(x + 5 + i, row, 4, STURDY);
        }
    }

    /** A walkway at height 2 on blue legs, with a gap in the middle to jump. */
    private bridge(x: number, y: number): void {
        for (const row of [y, y + 1]) {
            this.ramp(x + 0.5, row, "+x");
            this.block(x + 2, row, 0, STURDY);
            for (let i = 2; i <= 6; i++) this.block(x + i, row, 1, STURDY);
            // the gap
            for (let i = 10; i <= 14; i++) this.block(x + i, row, 1, STURDY);
            this.block(x + 14, row, 0, STURDY);
            this.ramp(x + 15.5, row, "-x");
        }
    }

    // ---- Things to knock over ------------------------------------------------------------

    /** Loose crates stacked straight up: shoot the bottom one and the stack comes down. */
    private towers(): void {
        for (const [x, y, height] of [[4, 12, 5], [7, 12, 4], [-10, -4, 5], [16, 14, 4], [-4, 24, 5]]) {
            for (let level = 0; level < height; level++) this.block(x, y, level, LOOSE);
        }
    }

    /** A block of loose crates, stacked three high. */
    private crateYard(x: number, y: number): void {
        for (let dx = 0; dx < 4; dx++) {
            for (let dy = 0; dy < 4; dy++) {
                const height = (dx + dy) % 3 === 0 ? 3 : 2;
                for (let level = 0; level < height; level++) this.block(x + dx, y + dy, level, LOOSE);
            }
        }
    }

    /** A pyramid of loose crates, five wide at the bottom. */
    private pyramid(x: number, y: number, color: number): void {
        const options: BlockOptions = { color, dynamic: true, fragile: true };
        for (let level = 0; level < 3; level++) {
            const width = 5 - level * 2;
            for (let i = 0; i < width; i++) this.block(x + level + i, y, level, options);
        }
    }

    /** Thin, tall blocks in a row: push the first one over. */
    private dominoes(x: number, y: number, count: number): void {
        const size = new Vector3(0.25, 1, 1.6);
        for (let i = 0; i < count; i++) {
            // 1.6 tall, so it reaches into the cell above as well
            if (!this.claim(x + i, y, 0) || !this.claim(x + i, y, 1)) continue;
            spawnBlock(new Vector3(x + i, y, size.z / 2), { size, ...LOOSE });
        }
    }

    // ---- Things to shoot -----------------------------------------------------------------

    /** Fragile walls, one block thick, with lanes between them. The gun punches straight through. */
    private shootingGallery(x: number, y: number): void {
        for (let wall = 0; wall < 3; wall++) {
            const column = x + wall * 3;
            for (let dy = 0; dy < 6; dy++) {
                for (let level = 0; level < 3; level++) this.block(column, y + dy, level, FRAGILE);
            }
        }
    }

    /** A solid slab that shrugs off bullets. It takes a rocket to bring it down. */
    private pillar(x: number, y: number, width: number, height: number): void {
        for (let level = 0; level < height; level++) {
            for (let dx = 0; dx < width; dx++) {
                for (let dy = 0; dy < width; dy++) this.block(x + dx, y + dy, level, STURDY);
            }
        }
    }

    // ---- Loose odds and ends -------------------------------------------------------------

    private balls(): void {
        for (const [x, y, radius] of [
            [2, 6, 0.4], [3, 8, 0.6], [-8, 10, 0.5], [12, -4, 0.8],
            [-16, -2, 0.45], [20, 16, 0.7], [-2, -10, 0.55], [8, 22, 0.5],
        ]) {
            this.ball(x, y, 0, radius);
        }
    }

    /** Single crates dotted around, so the open ground isn't completely empty. */
    private scatter(): void {
        const spots: [number, number][] = [
            [-5, 3], [7, -9], [-12, 13], [15, 5], [-22, -14], [19, -18],
            [-19, 7], [5, 20], [-3, 19], [23, -3], [-25, 1], [1, 26],
        ];
        for (const [x, y] of spots) {
            this.block(x, y, 0, LOOSE);
            this.block(x + 1, y, 0, PLAIN);
        }
    }

    // ---- Placement -----------------------------------------------------------------------

    /**
     * Takes a cell, or reports that something else already has it. Anything placed in the stage
     * goes through here, which is what guarantees no two bodies start out inside each other.
     */
    private claim(x: number, y: number, level: number): boolean {
        const key = `${Math.round(x)},${Math.round(y)},${Math.round(level)}`;
        if (this._taken.has(key)) {
            console.warn(`SandboxStage: cell ${key} is already taken, skipping this prop`);
            return false;
        }
        this._taken.add(key);
        return true;
    }

    /** A 1x1x1 block resting on top of height `level`. */
    private block(x: number, y: number, level: number, options: BlockOptions): void {
        if (!this.claim(x, y, level)) return;
        spawnBlock(new Vector3(x, y, level + BLOCK_Z), options);
    }

    /**
     * A 2-long ramp. `base` is the middle of its footprint, so it straddles the two cells either
     * side along the direction it rises; both of those are claimed.
     */
    private ramp(baseX: number, baseY: number, rise: RampDirection): void {
        const alongX = rise === "+x" || rise === "-x";
        const first: [number, number] = alongX ? [baseX - 0.5, baseY] : [baseX, baseY - 0.5];
        const second: [number, number] = alongX ? [baseX + 0.5, baseY] : [baseX, baseY + 0.5];
        if (!this.claim(first[0], first[1], 0) || !this.claim(second[0], second[1], 0)) return;

        spawnRamp(new Vector3(baseX, baseY, 0), { rise, ...STURDY });
    }

    /** A ball resting on top of height `level`. */
    private ball(x: number, y: number, level: number, radius: number): void {
        if (!this.claim(x, y, level)) return;
        spawnBall(new Vector3(x, y, level + radius + 0.05), { radius });
    }
}

export default SandboxStage;
