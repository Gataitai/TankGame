import EnemyTank from "@/entities/tanks/EnemyTank";
import PlayerTank from "@/entities/tanks/PlayerTank";
import Scene from "@/scene/Scene";
import LevelManager from "@/scene/managers/LevelManager";
import { LEVEL_TRANSITION_TIME, MAP_SIZE } from "@/config";

type LevelState = "loading" | "playing" | "ended";

/**
 * Level mode: a fixed obstacle layout per level and three enemies. Destroy them all to go to the
 * next level; get destroyed and you start again at level 1.
 */
class GameScene extends Scene {
    private readonly _levels = new LevelManager();
    private _state: LevelState = "loading";
    private _transitionTimer = 0;

    constructor() {
        super(MAP_SIZE);
    }

    protected async onLoad(): Promise<void> {
        await this.addLights();
        await this.startLevel();
    }

    protected onUpdate(deltaT: number): void {
        if (this._state === "playing") {
            if (!this.find(PlayerTank)) this.endLevel(false);
            else if (!this.find(EnemyTank)) this.endLevel(true);
        } else if (this._state === "ended") {
            this._transitionTimer -= deltaT;
            if (this._transitionTimer <= 0) this.restartLevel();
        }
    }

    private async startLevel(): Promise<void> {
        this._state = "loading";
        this.hud.hideMessage();
        this.hud.setStatus(`Level ${this._levels.level}`);

        await this._levels.build(this);
        this._state = "playing";
    }

    private endLevel(won: boolean): void {
        this._state = "ended";
        this._transitionTimer = LEVEL_TRANSITION_TIME;

        const level = this._levels.level;
        if (won) {
            this.hud.showMessage(`Level ${level} cleared!`);
            this._levels.advance();
        } else {
            this.hud.showMessage(`Destroyed on level ${level}`);
            this._levels.reset();
        }
    }

    private restartLevel(): void {
        // Everything except the light indicators is rebuilt
        this.removeEntities((entity) => !entity.persistent);
        void this.startLevel();
    }
}

export default GameScene;
