import type Entity from "@/entities/Entity";
import type PlayerTank from "@/entities/tanks/PlayerTank";
import type TreadsCanvas from "@/map/TreadsCanvas";

export type Spawn = <T extends Entity>(entity: T) => Promise<T>;

export type StageEntities = {
    player: PlayerTank;
    treads: TreadsCanvas;
};

/**
 * A scene the game can play: it builds the map and decides when it's won.
 * Press N in game to switch to the next one (see GameScene).
 */
interface Stage {
    /** Name shown when switching to this stage. */
    readonly name: string;

    /** Text in the HUD's corner while playing it (e.g. "Level 3"). */
    readonly title: string;

    /** Spawns everything: ground, walls, objects and tanks. */
    build(spawn: Spawn, mapSize: number): Promise<StageEntities>;

    /** Whether the goal has been reached (e.g. every enemy is destroyed). */
    isCleared(entities: readonly Entity[]): boolean;

    /** The goal was reached. Returns the message to show before the stage is rebuilt. */
    onCleared(): string;

    /** The player was destroyed. Returns the message to show before the stage is rebuilt. */
    onFailed(): string;
}

export default Stage;
