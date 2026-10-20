import { Vector3 } from "three";
import GameMap from "@/map/GameMap";
import TreadsCanvas from "@/map/TreadsCanvas";
import Wall from "@/map/Wall";
import type Scene from "@/scene/Scene";
import { WALL_Z } from "@/config";

/** Adds what every map has: the ground, the tread-mark overlay and the border walls. */
export async function buildMapBase(scene: Scene): Promise<void> {
    const size = scene.mapSize;
    const center = new Vector3(size / 2, size / 2, 0);

    await Promise.all([
        scene.add(new GameMap(center)),
        scene.add(new TreadsCanvas(size, center)),
        ...borderPositions(size).map((position) => scene.add(new Wall(position))),
    ]);
}

/** Wall positions along the edge of a size x size map. */
export function borderPositions(size: number): Vector3[] {
    const edge = size - 1;
    const positions: Vector3[] = [];
    for (let i = 0; i <= edge; i++) {
        positions.push(new Vector3(i, 0, WALL_Z), new Vector3(i, edge, WALL_Z));
        if (i > 0 && i < edge) positions.push(new Vector3(0, i, WALL_Z), new Vector3(edge, i, WALL_Z));
    }
    return positions;
}

/** Removes duplicate tiles (positions are compared by their x/y). */
export function uniquePositions(positions: Vector3[]): Vector3[] {
    const seen = new Set<string>();
    return positions.filter((p) => {
        const key = `${p.x},${p.y}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
