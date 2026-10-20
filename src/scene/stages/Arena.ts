import { Vector3 } from "three";
import GameMap from "@/map/GameMap";
import TreadsCanvas from "@/map/TreadsCanvas";
import Wall from "@/map/Wall";
import type { Spawn } from "@/scene/stages/Stage";
import { WALL_Z } from "@/config";

/**
 * What every stage starts with: the ground, the tread-mark overlay and the walls around the map.
 * Returns the treads overlay and the promises of everything spawned.
 */
export function buildArena(spawn: Spawn, mapSize: number): { treads: Promise<TreadsCanvas>; pending: Promise<unknown>[] } {
    const center = new Vector3(mapSize / 2, mapSize / 2, 0);
    const pending: Promise<unknown>[] = [spawn(new GameMap(center))];
    const treads = spawn(new TreadsCanvas(mapSize, center));

    for (const position of borderPositions(mapSize)) {
        pending.push(spawn(new Wall(position)));
    }
    return { treads, pending };
}

function borderPositions(mapSize: number): Vector3[] {
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
    return uniquePositions(positions);
}

/** Drops positions on a tile that's already taken (by x/y). */
export function uniquePositions(positions: Vector3[]): Vector3[] {
    const seen = new Set<string>();
    return positions.filter((p) => {
        const key = `${p.x},${p.y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
