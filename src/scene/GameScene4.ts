import { Vector3 } from "three";
import PlayerTank from "@/entities/tanks/PlayerTank";
import { buildMapBase } from "@/map/MapBuilder";
import PhysicsBox from "@/physics/PhysicsBox";
import Fragment from "@/physics/Fragment";
import Scene from "@/scene/Scene";
import { MAP_SIZE } from "@/config";

const PILLAR_SIZE = new Vector3(1, 1, 3);
const BRIDGE_SIZE = new Vector3(5, 1.2, 0.5);
/** Distance between the two pillars' centres. */
const PILLAR_SPACING = 3;
/** Seconds before the player tank comes back after being destroyed (e.g. by its own mine). */
const RESPAWN_DELAY = 2;
const PLAYER_START = new Vector3(4, 4, 0);

/** The construction shatters when shot, and its pieces stay on the ground. */
const PIECE_OPTIONS = { breakable: true, keepPieces: true };

/**
 * Construction site: an open map (no enemies) with a small physics construction in the middle,
 * two pillars with a bridge resting on top. Push it or jump on it, or shoot or mine it to
 * shatter it; press R to rebuild it (and sweep up the pieces).
 */
class GameScene4 extends Scene {
    private _construction: PhysicsBox[] = [];
    private _respawnTimer: number | null = null;

    constructor() {
        super(MAP_SIZE);
    }

    protected async onLoad(): Promise<void> {
        this.hud.setStatus("Construction site · R to rebuild");
        this.bindKey("KeyR", () => void this.buildConstruction());

        await this.addLights();
        await Promise.all([
            buildMapBase(this),
            this.add(new PlayerTank(PLAYER_START)),
            this.buildConstruction(),
        ]);
    }

    protected onUpdate(deltaT: number): void {
        // There are no enemies, but the player can still blow itself up with a landmine
        if (this.find(PlayerTank)) return;

        this._respawnTimer ??= RESPAWN_DELAY;
        this._respawnTimer -= deltaT;
        if (this._respawnTimer <= 0) {
            this._respawnTimer = null;
            void this.add(new PlayerTank(PLAYER_START));
        }
    }

    /** Removes the current construction and its broken pieces (if any) and builds it again. */
    private async buildConstruction(): Promise<void> {
        // Remove right away, so the old pieces can't collide with the new ones
        this.remove([...this._construction, ...this.findAll(Fragment)]);

        const center = new Vector3(this.mapSize / 2, this.mapSize / 2, 0);
        const pillarZ = PILLAR_SIZE.z / 2;
        const bridgeZ = PILLAR_SIZE.z + BRIDGE_SIZE.z / 2;

        this._construction = [
            new PhysicsBox(new Vector3(center.x - PILLAR_SPACING / 2, center.y, pillarZ), PILLAR_SIZE, PIECE_OPTIONS),
            new PhysicsBox(new Vector3(center.x + PILLAR_SPACING / 2, center.y, pillarZ), PILLAR_SIZE, PIECE_OPTIONS),
            new PhysicsBox(new Vector3(center.x, center.y, bridgeZ), BRIDGE_SIZE, PIECE_OPTIONS),
        ];
        await Promise.all(this._construction.map((piece) => this.add(piece)));
    }
}

export default GameScene4;
