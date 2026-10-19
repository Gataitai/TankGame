import { Vector3 } from "three";
import BasicEnemyTank from "@/entities/tanks/BasicEnemyTank";
import PlayerTank from "@/entities/tanks/PlayerTank";
import TacticalEnemyTank from "@/entities/tanks/TacticalEnemyTank";
import { buildMapBase } from "@/map/MapBuilder";
import PhysicsBall from "@/physics/PhysicsBall";
import Scene from "@/scene/Scene";
import EnemyTracker from "@/scene/managers/EnemyTracker";
import { BALL_ARENA, ENEMY_AI, MAP_SIZE } from "@/config";

type BallArenaState = "loading" | "playing" | "destroyed";

/**
 * Ball arena: an open map (border walls only) with a physics ball in the middle. Tanks can push
 * the ball around by driving into it, and shooting it kicks it away. Destroyed enemies are
 * replaced after a short delay; when the player is destroyed the scene restarts.
 */
class GameScene3 extends Scene {
    private _state: BallArenaState = "loading";
    private _respawnTimer = 0;
    private _restartTimer = 0;
    private readonly _enemies = new EnemyTracker();

    constructor() {
        super(MAP_SIZE);
    }

    protected async onLoad(): Promise<void> {
        await this.addLights();
        await this.build();
    }

    protected onUpdate(deltaT: number): void {
        if (this._enemies.update() > 0) this.updateStatus();

        if (this._state === "playing") {
            if (!this.find(PlayerTank)) {
                this._state = "destroyed";
                this._restartTimer = BALL_ARENA.restartDelay;
                this.hud.showMessage("Destroyed!");
                return;
            }

            if (this._enemies.count < BALL_ARENA.enemies) {
                this._respawnTimer -= deltaT;
                if (this._respawnTimer <= 0) {
                    this.spawnEnemy();
                    this._respawnTimer = BALL_ARENA.respawnDelay;
                }
            } else {
                this._respawnTimer = BALL_ARENA.respawnDelay;
            }
        } else if (this._state === "destroyed") {
            this._restartTimer -= deltaT;
            if (this._restartTimer <= 0) this.restart();
        }
    }

    private async build(): Promise<void> {
        this._state = "loading";
        this._enemies.reset();
        this.hud.hideMessage();
        this.updateStatus();

        const center = new Vector3(this.mapSize / 2, this.mapSize / 2, 0);
        await Promise.all([
            buildMapBase(this),
            this.add(new PhysicsBall(center)),
            this.add(new PlayerTank(new Vector3(4, 4, 0))),
        ]);

        for (let i = 0; i < BALL_ARENA.enemies; i++) this.spawnEnemy();
        this._respawnTimer = BALL_ARENA.respawnDelay;
        this._state = "playing";
    }

    private restart(): void {
        this.removeEntities((entity) => !entity.persistent);
        void this.build();
    }

    /** Spawns an enemy in the free corner furthest from the player. */
    private spawnEnemy(): void {
        const far = this.mapSize - 5;
        const corners = [new Vector3(far, 4, 0), new Vector3(4, far, 0), new Vector3(far, far, 0), new Vector3(4, 4, 0)];
        const player = this.find(PlayerTank);
        const taken = [...this._enemies.enemies].map((enemy) => enemy.position);

        const free = corners.filter((corner) => taken.every((position) => position.distanceTo(corner) > 2));
        if (free.length === 0) return;
        if (player) free.sort((a, b) => b.distanceTo(player.position) - a.distanceTo(player.position));

        const EnemyClass = ENEMY_AI === "tactical" ? TacticalEnemyTank : BasicEnemyTank;
        void this.add(this._enemies.track(new EnemyClass(free[0])));
    }

    private updateStatus(): void {
        this.hud.setStatus(`Ball arena · Kills: ${this._enemies.kills}`);
    }
}

export default GameScene3;
