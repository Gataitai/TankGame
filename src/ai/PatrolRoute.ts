import { Vector3 } from "three";
import NavGrid from "./NavGrid";
import { randomElement } from "@/utils/MathUtils";

const DEFAULT_WAYPOINTS = 6;
/** Waypoints closer to the centre than this (fraction of the map radius) are skipped. */
const MIN_RADIUS = 0.25;

/**
 * Builds a patrol loop around the map.
 *
 * Open tiles (no walls next to them) are grouped into pie slices around the map centre, one
 * random tile is picked from each slice, and the slices are visited in order, so the tank
 * circles the whole map. Each tank gets its own random loop and direction, and starts at the
 * waypoint closest to it.
 */
export function createPatrolRoute(grid: NavGrid, start: Vector3, waypointCount = DEFAULT_WAYPOINTS): Vector3[] {
    const center = (grid.size - 1) / 2;
    const slices: Vector3[][] = Array.from({ length: waypointCount }, () => []);

    for (const tile of grid.openTiles()) {
        const dx = tile.x - center;
        const dy = tile.y - center;
        if (Math.hypot(dx, dy) < center * MIN_RADIUS) continue;

        const angle = Math.atan2(dy, dx) + Math.PI; // 0..2PI
        const slice = Math.floor((angle / (Math.PI * 2)) * waypointCount) % waypointCount;
        slices[slice].push(new Vector3(tile.x, tile.y, 0));
    }

    const route = slices.filter((tiles) => tiles.length > 0).map(randomElement);
    if (route.length === 0) return [];
    if (Math.random() < 0.5) route.reverse();

    let nearest = 0;
    route.forEach((point, i) => {
        if (point.distanceToSquared(start) < route[nearest].distanceToSquared(start)) nearest = i;
    });
    return [...route.slice(nearest), ...route.slice(0, nearest)];
}
