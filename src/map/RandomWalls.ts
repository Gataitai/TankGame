import { Vector3 } from "three";
import { randomIntInRange } from "@/utils/MathUtils";
import { WALL_Z } from "@/config";

/** A straight line of wall positions. */
export type WallSegment = Vector3[];

const MIN_LENGTH = 2;
const MAX_LENGTH = 5;

/**
 * Random straight wall segments for a size x size map that has a border wall.
 *
 * - A segment is rejected if it would cut off any part of the map, so every free tile stays
 *   reachable (checked with a flood fill).
 * - Nothing is placed within `clearance` tiles of the `keepClear` points (e.g. the player start).
 * - The lane right next to the border is kept free so tanks can always drive around the edge.
 */
export function generateRandomWalls(size: number, segmentCount: number, keepClear: Vector3[], clearance = 2): WallSegment[] {
    const edge = size - 1;
    const blocked = new Uint8Array(size * size);
    const index = (x: number, y: number) => y * size + x;
    for (let i = 0; i <= edge; i++) {
        blocked[index(i, 0)] = blocked[index(i, edge)] = blocked[index(0, i)] = blocked[index(edge, i)] = 1;
    }

    const isNearKeepClear = (x: number, y: number) =>
        keepClear.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= clearance);

    const segments: WallSegment[] = [];
    for (let attempt = 0; attempt < segmentCount * 25 && segments.length < segmentCount; attempt++) {
        const length = randomIntInRange(MIN_LENGTH, MAX_LENGTH);
        const horizontal = Math.random() < 0.5;
        const x0 = randomIntInRange(2, edge - 2);
        const y0 = randomIntInRange(2, edge - 2);

        const tiles: [number, number][] = [];
        for (let i = 0; i < length; i++) {
            tiles.push(horizontal ? [x0 + i, y0] : [x0, y0 + i]);
        }
        const fits = tiles.every(([x, y]) =>
            x >= 2 && y >= 2 && x <= edge - 2 && y <= edge - 2 && !blocked[index(x, y)] && !isNearKeepClear(x, y));
        if (!fits) continue;

        tiles.forEach(([x, y]) => (blocked[index(x, y)] = 1));
        if (!isFullyConnected(blocked, size)) {
            tiles.forEach(([x, y]) => (blocked[index(x, y)] = 0)); // Would wall something off: undo
            continue;
        }
        segments.push(tiles.map(([x, y]) => new Vector3(x, y, WALL_Z)));
    }
    return segments;
}

/** Whether all free tiles are reachable from each other (moving horizontally/vertically). */
function isFullyConnected(blocked: Uint8Array, size: number): boolean {
    const free = blocked.reduce((count, b) => count + (b ? 0 : 1), 0);
    const start = blocked.indexOf(0);
    if (start < 0) return true;

    const visited = new Uint8Array(blocked.length);
    const queue = [start];
    visited[start] = 1;
    let reached = 0;

    while (queue.length > 0) {
        const current = queue.pop()!;
        reached++;
        const x = current % size;
        const y = Math.floor(current / size);
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const next = ny * size + nx;
            if (!blocked[next] && !visited[next]) {
                visited[next] = 1;
                queue.push(next);
            }
        }
    }
    return reached === free;
}
