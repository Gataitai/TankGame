/**
 * A scene the world can load. It spawns everything in it through the prefabs; the entities it
 * makes are owned by the Ecs, so it has nothing to hand back.
 *
 * Press N in game to switch to the next one, R to rebuild the current one (see World).
 */
interface Stage {
    /** Name shown when switching to this stage. */
    readonly name: string;

    /** Text in the HUD's corner while it's loaded. */
    readonly title: string;

    /** Props are scattered over roughly this many tiles square. */
    readonly mapSize: number;

    /** Where the player starts, and which way it faces (radians around +Z from +X). */
    readonly playerStart: { x: number; y: number; yaw: number };

    build(): void;
}

export default Stage;
