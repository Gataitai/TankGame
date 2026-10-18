import { Vector3 } from "three";
import MinHeap from "./MinHeap";

export type Tile = { x: number; y: number };

/** Extra cost for entering a tile, e.g. to avoid tiles occupied by other tanks. */
export type TileCostFn = (x: number, y: number) => number;

/** One leg of a path: drive with `heading` until reaching `point`. */
export type PathStep = { point: Vector3; heading: number };

/** Angle between two neighbouring movement directions. */
const HEADING_STEP = Math.PI / 4;

/** Each wall next to a tile makes it more expensive, so paths keep some distance from walls. */
const WALL_PROXIMITY_COST = 0.75;
const SAMPLE_STEP = 0.2;

/**
 * The 8 movement directions. Direction i has heading angle i * 45 degrees, using the game's
 * convention (0 = towards -Y, see directionFromAngle), so index 0 = S on screen, 2 = E, 4 = N, 6 = W.
 */
const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1],
];

/**
 * The AI's knowledge of the map: a tile grid (one tile per wall slot) that knows which tiles are
 * blocked by walls. It's kept up to date by the EntityManager as walls are added and destroyed.
 *
 * Provides A* path finding (8 directions) and line-of-sight checks.
 */
class NavGrid {
    public readonly size: number;
    /** Number of walls on each tile (0 = walkable). */
    private readonly _blocked: Uint16Array;
    private _version = 0;

    constructor(size: number) {
        this.size = size;
        this._blocked = new Uint16Array(size * size);
    }

    /** Increments whenever a wall is added or removed, so cached paths know they're stale. */
    public get version(): number {
        return this._version;
    }

    public tileOf(position: Vector3): Tile {
        return { x: Math.round(position.x), y: Math.round(position.y) };
    }

    public inBounds(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.size && y < this.size;
    }

    public isWalkable(x: number, y: number): boolean {
        return this.inBounds(x, y) && this._blocked[this.index(x, y)] === 0;
    }

    public block(position: Vector3): void {
        const { x, y } = this.tileOf(position);
        if (!this.inBounds(x, y)) return;
        this._blocked[this.index(x, y)]++;
        this._version++;
    }

    public unblock(position: Vector3): void {
        const { x, y } = this.tileOf(position);
        if (!this.inBounds(x, y)) return;
        const i = this.index(x, y);
        if (this._blocked[i] > 0) this._blocked[i]--;
        this._version++;
    }

    /** Number of blocked tiles among the 8 neighbours. */
    public wallsAround(x: number, y: number): number {
        let count = 0;
        for (const [dx, dy] of DIRECTIONS) {
            if (!this.isWalkable(x + dx, y + dy)) count++;
        }
        return count;
    }

    /** Walkable tiles with no walls next to them (good spots to drive to). */
    public openTiles(): Tile[] {
        const tiles: Tile[] = [];
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (this.isWalkable(x, y) && this.wallsAround(x, y) === 0) tiles.push({ x, y });
            }
        }
        return tiles;
    }

    /** Closest walkable tile to `tile` (itself if walkable), searching a few tiles out. */
    public nearestWalkable(tile: Tile, maxRadius = 4): Tile | null {
        if (this.isWalkable(tile.x, tile.y)) return tile;

        for (let r = 1; r <= maxRadius; r++) {
            let best: Tile | null = null;
            let bestDistance = Infinity;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
                    const x = tile.x + dx;
                    const y = tile.y + dy;
                    const distance = dx * dx + dy * dy;
                    if (distance < bestDistance && this.isWalkable(x, y)) {
                        best = { x, y };
                        bestDistance = distance;
                    }
                }
            }
            if (best) return best;
        }
        return null;
    }

    /**
     * A* over the tile grid. Moves are restricted to the 8 compass directions and never cut
     * corners past walls. Returns one step per tile after the start (tile centre + the heading
     * used to drive into it), or null if the goal can't be reached.
     */
    public findPath(from: Vector3, to: Vector3, extraCost?: TileCostFn): PathStep[] | null {
        const start = this.nearestWalkable(this.tileOf(from));
        const goal = this.nearestWalkable(this.tileOf(to));
        if (!start || !goal) return null;

        const count = this.size * this.size;
        const startIndex = this.index(start.x, start.y);
        const goalIndex = this.index(goal.x, goal.y);

        const costSoFar = new Float32Array(count).fill(Infinity);
        const cameFrom = new Int32Array(count).fill(-1);
        const closed = new Uint8Array(count);
        const open = new MinHeap();

        costSoFar[startIndex] = 0;
        open.push(startIndex, this.heuristic(start.x, start.y, goal));

        while (open.size > 0) {
            const current = open.pop();
            if (current === goalIndex) return this.reconstruct(cameFrom, current);
            if (closed[current]) continue;
            closed[current] = 1;

            const cx = current % this.size;
            const cy = Math.floor(current / this.size);

            for (const [dx, dy] of DIRECTIONS) {
                const nx = cx + dx;
                const ny = cy + dy;
                if (!this.isWalkable(nx, ny)) continue;

                const diagonal = dx !== 0 && dy !== 0;
                // Don't squeeze diagonally between two walls / around a wall corner
                if (diagonal && (!this.isWalkable(cx + dx, cy) || !this.isWalkable(cx, cy + dy))) continue;

                const next = this.index(nx, ny);
                if (closed[next]) continue;

                const cost = costSoFar[current]
                    + (diagonal ? Math.SQRT2 : 1)
                    + WALL_PROXIMITY_COST * this.wallsAround(nx, ny)
                    + (extraCost ? extraCost(nx, ny) : 0);

                if (cost < costSoFar[next]) {
                    costSoFar[next] = cost;
                    cameFrom[next] = current;
                    open.push(next, cost + this.heuristic(nx, ny, goal));
                }
            }
        }
        return null;
    }

    /**
     * Reduces a path to the points where the heading changes (plus the final point), so each
     * remaining step is one straight leg: "drive in this direction until you reach this point".
     */
    public static toLegs(steps: PathStep[]): PathStep[] {
        return steps.filter((step, i) => i === steps.length - 1 || steps[i + 1].heading !== step.heading);
    }

    /**
     * Whether a circle of `radius` can travel from `a` to `b` without touching a wall.
     * Used for line-of-sight and clear-shot checks.
     */
    public isSegmentClear(a: Vector3, b: Vector3, radius: number): boolean {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE_STEP));

        for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            if (this.circleHitsWall(a.x + dx * t, a.y + dy * t, radius)) return false;
        }
        return true;
    }

    private circleHitsWall(px: number, py: number, radius: number): boolean {
        const reach = radius + 0.5;
        for (let ty = Math.round(py - reach); ty <= Math.round(py + reach); ty++) {
            for (let tx = Math.round(px - reach); tx <= Math.round(px + reach); tx++) {
                if (this.isWalkable(tx, ty)) continue;
                // Walls are 1x1 boxes centred on their tile
                const ex = Math.max(Math.abs(px - tx) - 0.5, 0);
                const ey = Math.max(Math.abs(py - ty) - 0.5, 0);
                if (ex * ex + ey * ey < radius * radius - 1e-6) return true;
            }
        }
        return false;
    }

    private heuristic(x: number, y: number, goal: Tile): number {
        // Octile distance: exact for an empty 8-directional grid, so A* stays optimal
        const dx = Math.abs(x - goal.x);
        const dy = Math.abs(y - goal.y);
        return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    }

    private reconstruct(cameFrom: Int32Array, end: number): PathStep[] {
        const steps: PathStep[] = [];
        // Walk back to the start tile (which has no predecessor); it isn't part of the path
        for (let i = end; cameFrom[i] !== -1; i = cameFrom[i]) {
            const from = cameFrom[i];
            const dx = (i % this.size) - (from % this.size);
            const dy = Math.floor(i / this.size) - Math.floor(from / this.size);
            steps.push({
                point: new Vector3(i % this.size, Math.floor(i / this.size), 0),
                heading: DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy) * HEADING_STEP,
            });
        }
        return steps.reverse();
    }

    private index(x: number, y: number): number {
        return y * this.size + x;
    }
}

export default NavGrid;
