import { Vector3 } from "three";
import BasicEnemyTank from "@/entities/tanks/BasicEnemyTank";
import TacticalEnemyTank from "@/entities/tanks/TacticalEnemyTank";
import PlayerTank from "@/entities/tanks/PlayerTank";
import BreakableWall from "@/map/BreakableWall";
import Wall from "@/map/Wall";
import { buildMapBase } from "@/map/MapBuilder";
import { generateRandomWalls } from "@/map/RandomWalls";
import Scene from "@/scene/Scene";
import EnemyTracker from "@/scene/managers/EnemyTracker";
import { randomElement, randomIntInRange } from "@/utils/MathUtils";
import { ARENA, ENEMY_AI, MAP_SIZE } from "@/config";

type ArenaState = "loading" | "playing" | "destroyed";

/**
 * Arena mode: no levels, one map with randomly placed walls. Enemies spawn at random open spots
 * away from the player and keep coming over time (up to a maximum); the HUD counts kills.
 * When the player is destroyed, a new random arena is generated.
 */
class GameScene2 extends Scene {
    private _state: ArenaState = "loading";
    private _spawnTimer = 0;
    private _restartTimer = 0;
    private readonly _enemies = new EnemyTracker();

    constructor() {
        super(MAP_SIZE);
    }

    protected async onLoad(): Promise<void> {
        await this.addLights();
        await this.buildArena();
    }

    protected onUpdate(deltaT: number): void {
        if (this._enemies.update() > 0) this.updateStatus();

        if (this._state === "playing") {
            if (!this.find(PlayerTank)) {
                this._state = "destroyed";
                this._restartTimer = ARENA.restartDelay;
                const kills = this._enemies.kills;
                this.hud.showMessage(`Destroyed! ${kills} ${kills === 1 ? "kill" : "kills"}`);
                return;
            }

            this._spawnTimer -= deltaT;
            if (this._spawnTimer <= 0) {
                if (this._enemies.count < ARENA.maxEnemies) this.spawnEnemy();
                this._spawnTimer = ARENA.spawnInterval;
            }
        } else if (this._state === "destroyed") {
            this._restartTimer -= deltaT;
            if (this._restartTimer <= 0) this.restart();
        }
    }

    private async buildArena(): Promise<void> {
        this._state = "loading";
        this._enemies.reset();
        this.hud.hideMessage();
        this.updateStatus();

        const size = this.mapSize;
        const playerStart = new Vector3(randomIntInRange(3, size - 4), randomIntInRange(3, size - 4), 0);
        const segments = generateRandomWalls(size, ARENA.wallSegments, [playerStart]);

        await Promise.all([
            buildMapBase(this),
            ...segments.flatMap((segment) => {
                const breakable = Math.random() < ARENA.breakableChance;
                return segment.map((position) => this.add(breakable ? new BreakableWall(position) : new Wall(position)));
            }),
            this.add(new PlayerTank(playerStart)),
        ]);

        // The walls are in the nav grid now, so open spawn spots can be found
        for (let i = 0; i < ARENA.startEnemies; i++) this.spawnEnemy();
        this._spawnTimer = ARENA.spawnInterval;
        this._state = "playing";
    }

    private restart(): void {
        this.removeEntities((entity) => !entity.persistent);
        void this.buildArena();
    }

    /** Spawns an enemy on a random open tile, away from the player and the other enemies. */
    private spawnEnemy(): void {
        const player = this.find(PlayerTank);
        const others = [...this._enemies.enemies].map((enemy) => enemy.position);

        const spots = this.navGrid.openTiles()
            .map((tile) => new Vector3(tile.x, tile.y, 0))
            .filter((spot) =>
                (!player || spot.distanceTo(player.position) >= ARENA.minSpawnDistance)
                && others.every((position) => spot.distanceTo(position) >= 2));
        if (spots.length === 0) return;

        const EnemyClass = ENEMY_AI === "tactical" ? TacticalEnemyTank : BasicEnemyTank;
        void this.add(this._enemies.track(new EnemyClass(randomElement(spots))));
    }

    private updateStatus(): void {
        this.hud.setStatus(`Arena · Kills: ${this._enemies.kills}`);
    }
}

export default GameScene2;
