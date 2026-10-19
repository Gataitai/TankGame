import type EnemyTank from "@/entities/tanks/EnemyTank";

/**
 * Keeps track of the enemies a scene has spawned (including ones still loading) and counts
 * how many have been destroyed.
 */
class EnemyTracker {
    private readonly _enemies = new Set<EnemyTank>();
    private _kills = 0;

    /** Enemies that are alive (or still loading). */
    public get count(): number {
        return this._enemies.size;
    }

    public get kills(): number {
        return this._kills;
    }

    public get enemies(): ReadonlySet<EnemyTank> {
        return this._enemies;
    }

    public track<T extends EnemyTank>(enemy: T): T {
        this._enemies.add(enemy);
        return enemy;
    }

    /** Counts newly destroyed enemies. Returns how many were destroyed since the last call. */
    public update(): number {
        let destroyed = 0;
        for (const enemy of this._enemies) {
            if (enemy.shouldDispose) {
                this._enemies.delete(enemy);
                destroyed++;
            }
        }
        this._kills += destroyed;
        return destroyed;
    }

    /** Forgets all enemies and resets the kill count (e.g. when the scene restarts). */
    public reset(): void {
        this._enemies.clear();
        this._kills = 0;
    }
}

export default EnemyTracker;
