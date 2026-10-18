import { Vector3 } from "three";
import EnemyTank from "@/entities/tanks/EnemyTank";
import type PlayerTank from "@/entities/tanks/PlayerTank";
import { MUZZLE_DISTANCE } from "@/entities/tanks/Tank";
import { BULLET_SPEED } from "@/entities/weapons/Bullet";
import { createPatrolRoute } from "@/ai/PatrolRoute";
import NavGrid, { type PathStep } from "@/ai/NavGrid";
import GameScene from "@/scene/GameScene";
import {
    angleBetween,
    directionFromAngle,
    distanceToSegment2D,
    stepAngleTowards,
    wrapAngle,
} from "@/utils/MathUtils";

export enum TacticalState {
    Patrolling = "patrolling",
    Chasing = "chasing",
    Attacking = "attacking",
}

// ---- Perception
/** Can see the player up to this distance, if no wall is in between. */
const SIGHT_RANGE = 14;
/** Notices the player through walls when this close ("hears" it). */
const HEARING_RANGE = 7;
/**
 * After losing track of the player it keeps hunting: it drives to the last known position
 * (however long the detour) and only gives up when it gets there, or after this many seconds.
 */
const HUNT_TIMEOUT = 20;
const SIGHT_CHECK_INTERVAL = 0.1;
/** Radius used for line-of-sight checks (a bit bigger than a bullet). */
const SIGHT_RADIUS = 0.1;

// ---- Movement
// The body only ever faces one of the 8 compass directions: it turns on the spot at the
// corners of its path and drives in straight lines between them.
const BODY_ROTATION_SPEED = Math.PI * 2.5;
const TURRET_ROTATION_SPEED = Math.PI * 1.5;
/** While driving a leg, how fast (relative to speed) it drifts sideways back onto the grid line. */
const LATERAL_CORRECTION = 0.5;
/** Positions closer than this to a point count as being exactly on it. */
const CENTER_EPSILON = 1e-5;
/** A leg counts as done when the tank has (e.g. after being pushed) got this far past its end. */
const PASSED_LEG_DISTANCE = 0.1;
const REPATH_INTERVAL = 0.75;
/** Repath right away when the goal moves further than this. */
const GOAL_MOVED_DISTANCE = 1;
/** Extra path cost for tiles where other enemy tanks are, so they route around each other. */
const OCCUPIED_TILE_COST = 6;
const STUCK_CHECK_INTERVAL = 0.8;
const STUCK_DISTANCE = 0.2;
const REVERSE_TIME = 0.5;

// ---- Patrol
const PATROL_PAUSE_MIN = 0.8;
const PATROL_PAUSE_MAX = 2;
const SCAN_ANGLE_DRIVING = 0.35;
const SCAN_ANGLE_PAUSED = 1.2;

// ---- Combat
/** Closes in when the player is further away than this, even with a clear shot. */
const ENGAGE_RANGE = 9;
/** Only fires when the turret is within this many radians of the aim point. */
const FIRE_ALIGNMENT = 0.06;
const FIRE_COOLDOWN = 0.6;
const FIRE_COOLDOWN_JITTER = 0.4;
/** Random spread per shot, so enemies aren't perfect marksmen. */
const AIM_SPREAD = 0.04;
/** Limit on how far ahead of the player to aim. */
const MAX_LEAD_TIME = 1.5;
/** Don't fire if a friendly tank is this close to the line of fire. */
const FRIENDLY_CLEARANCE = 0.75;
/** If it has the player in sight but no clear shot for this long, it moves in. */
const BLOCKED_SHOT_TIMEOUT = 1.5;
/** While attacking it moves between firing positions every few seconds (harder to hit). */
const REPOSITION_INTERVAL_MIN = 2.5;
const REPOSITION_INTERVAL_MAX = 4.5;
const REPOSITION_SEARCH_RADIUS = 3;
/** Preferred distance to the player when picking a firing position. */
const MIN_FIRING_DISTANCE = 4;

/**
 * A smarter enemy that uses the map:
 *
 * Like the basic AI, the body only ever faces one of the 8 compass directions: it follows its
 * A* path in straight legs and turns on the spot at the corners.
 *
 * - **Patrolling**: drives a loop of waypoints around the map (planned with A*), stopping at
 *   each one to look around with its turret.
 * - **Chasing**: knows where the player is (or was) but has no line of sight. Follows a path
 *   around the walls towards the player and never fires blindly into a wall. After losing
 *   track of the player it searches the last known position before giving up.
 * - **Attacking**: has line of sight. Leads its shots based on the player's movement, only
 *   fires when the shot is clear of walls and friendly tanks, closes in when far away and
 *   keeps moving between nearby firing positions.
 */
class TacticalEnemyTank extends EnemyTank {
    private _state = TacticalState.Patrolling;

    // Perception
    private _canSeePlayer = false;
    private _awareOfPlayer = false;
    private _sightTimer = Math.random() * SIGHT_CHECK_INTERVAL;
    private _hunting = false;
    private _huntTime = 0;
    private readonly _lastKnownPlayerPosition = new Vector3();
    private readonly _playerVelocity = new Vector3();
    private _previousPlayerPosition: Vector3 | null = null;

    // Navigation
    /** Remaining legs of the current path (straight runs between turns). */
    private _path: PathStep[] = [];
    private _pathFailed = false;
    private _forceRepath = false;
    /** A new path is wanted; it will be planned at the next tile centre on the current line. */
    private _replanAtNextTile = false;
    /** The tank should stop; it will do so at the next tile centre on the current line. */
    private _stopAtNextTile = false;
    private readonly _navigationGoal = new Vector3();
    private _repathTimer = 0;
    private _pathGridVersion = -1;
    private readonly _pathGoal = new Vector3(Infinity, Infinity, 0);
    private _driveTime = 0;
    private readonly _progressAnchor = new Vector3();
    private _reverseTimer = 0;

    // Patrol
    private _route: Vector3[] = [];
    private _routeIndex = 0;
    private _patrolPause = 0;
    private _scanTime = Math.random() * 10;

    // Combat
    private _fireCooldown = FIRE_COOLDOWN + Math.random() * FIRE_COOLDOWN_JITTER;
    private _blockedShotTime = 0;
    private _repositionTimer = 0;
    private _firingPosition: Vector3 | null = null;

    constructor(position: Vector3, speed = 3) {
        super(position, speed);
        this._progressAnchor.copy(position);
    }

    public get state(): TacticalState {
        return this._state;
    }

    /** Remaining turn points of the current path (for the AI debug view). */
    public get path(): Vector3[] {
        return this._path.map((step) => step.point);
    }

    public get patrolRoute(): readonly Vector3[] {
        return this._route;
    }

    protected think(deltaT: number): void {
        const player = GameScene.instance.player;
        this.perceive(player, deltaT);

        const next = this.decideState(player);
        if (next !== this._state) this.enterState(next);

        switch (this._state) {
            case TacticalState.Patrolling:
                this.patrol(deltaT);
                break;
            case TacticalState.Chasing:
                this.chase(player, deltaT);
                break;
            case TacticalState.Attacking:
                this.attack(player!, deltaT);
                break;
        }
    }

    // ---- Perception & decisions --------------------------------------------------------

    private perceive(player: PlayerTank | null, deltaT: number): void {
        if (!player) {
            this._canSeePlayer = false;
            this._awareOfPlayer = false;
            this._previousPlayerPosition = null;
            this._hunting = false;
            return;
        }

        // Smoothed velocity estimate, used to lead shots
        if (this._previousPlayerPosition && deltaT > 0) {
            const velocity = player.position.clone().sub(this._previousPlayerPosition).divideScalar(deltaT);
            this._playerVelocity.lerp(velocity, Math.min(1, deltaT * 8));
            this._previousPlayerPosition.copy(player.position);
        } else {
            this._previousPlayerPosition = player.position.clone();
        }

        // Line of sight is relatively expensive, so it's checked a few times per second
        this._sightTimer -= deltaT;
        if (this._sightTimer <= 0) {
            this._sightTimer = SIGHT_CHECK_INTERVAL;
            const distance = this.position.distanceTo(player.position);
            this._canSeePlayer = distance <= SIGHT_RANGE
                && GameScene.instance.navGrid.isSegmentClear(this.position, player.position, SIGHT_RADIUS);
            this._awareOfPlayer = this._canSeePlayer || distance <= HEARING_RANGE;
        }

        if (this._awareOfPlayer) {
            this._lastKnownPlayerPosition.copy(player.position);
            this._hunting = true;
            this._huntTime = 0;
        } else if (this._hunting) {
            this._huntTime += deltaT;
            if (this._huntTime > HUNT_TIMEOUT) this._hunting = false;
        }
    }

    private decideState(player: PlayerTank | null): TacticalState {
        if (player && this._canSeePlayer) return TacticalState.Attacking;
        if (this._hunting) return TacticalState.Chasing;
        return TacticalState.Patrolling;
    }

    private enterState(state: TacticalState): void {
        this._state = state;
        // Keep the current line until the next tile centre, then re-plan (or stop) from there
        this._replanAtNextTile = this._path.length > 0;
        this._repathTimer = 0;
        this._blockedShotTime = 0;
        this._firingPosition = null;
        this._repositionTimer = 0;
        this.resetProgress();

        if (state === TacticalState.Patrolling) {
            // Continue the patrol loop from wherever we ended up
            this._routeIndex = this.nearestRouteIndex();
            this._patrolPause = 0;
        }
    }

    // ---- States ------------------------------------------------------------------------

    private patrol(deltaT: number): void {
        if (this._route.length === 0) {
            this._route = createPatrolRoute(GameScene.instance.navGrid, this.position);
            this._routeIndex = 0;
            if (this._route.length === 0) return; // No open space at all; just stand guard
        }

        this._scanTime += deltaT;

        if (this._patrolPause > 0) {
            // Stop at the waypoint and look around
            this._patrolPause -= deltaT;
            this.rotateTurretTowards(this.travelHeading + Math.sin(this._scanTime * 1.5) * SCAN_ANGLE_PAUSED, deltaT);
            return;
        }

        const arrived = this.followPathTo(this._route[this._routeIndex], deltaT);
        this.rotateTurretTowards(this.travelHeading + Math.sin(this._scanTime * 0.8) * SCAN_ANGLE_DRIVING, deltaT);

        if (arrived || this._pathFailed) {
            // Unreachable waypoints (e.g. walled in) are simply skipped
            this._routeIndex = (this._routeIndex + 1) % this._route.length;
            this._patrolPause = arrived ? PATROL_PAUSE_MIN + Math.random() * (PATROL_PAUSE_MAX - PATROL_PAUSE_MIN) : 0;
            this._path = [];
            this._pathFailed = false;
        }
    }

    /** No line of sight: drive around the walls to where the player is (or was last seen). */
    private chase(player: PlayerTank | null, deltaT: number): void {
        const tracking = player !== null && this._awareOfPlayer;
        const goal = tracking ? player.position : this._lastKnownPlayerPosition;

        const arrived = this.followPathTo(goal, deltaT);

        // Keep the gun pointed where the player is expected to appear, but don't shoot
        this.rotateTurretTowards(angleBetween(this.position, goal), deltaT);

        if (!tracking && (arrived || this._pathFailed)) {
            // Searched the last known position and found nothing: give up
            this._hunting = false;
        }
    }

    /** Line of sight: aim (leading the target) and fire when the shot is clear. */
    private attack(player: PlayerTank, deltaT: number): void {
        const aimPoint = this.predictAimPoint(player);
        const aimAngle = angleBetween(this.position, aimPoint);
        const misalignment = this.rotateTurretTowards(aimAngle, deltaT);

        this._fireCooldown -= deltaT;
        if (this.hasClearShot(aimPoint, aimAngle)) {
            this._blockedShotTime = 0;
            if (misalignment < FIRE_ALIGNMENT && this._fireCooldown <= 0) {
                this.fire(this._weapon, this._turretRotation + (Math.random() * 2 - 1) * AIM_SPREAD);
                this._fireCooldown = FIRE_COOLDOWN + Math.random() * FIRE_COOLDOWN_JITTER;
            }
        } else {
            this._blockedShotTime += deltaT;
        }

        const distance = this.position.distanceTo(player.position);
        if (distance > ENGAGE_RANGE || this._blockedShotTime > BLOCKED_SHOT_TIMEOUT) {
            // Too far, or a wall corner / friendly tank keeps blocking the shot: move in
            this._firingPosition = null;
            this.followPathTo(player.position, deltaT);
            return;
        }

        // In range: keep moving between firing positions so it isn't a sitting duck
        this._repositionTimer -= deltaT;
        if (this._repositionTimer <= 0) {
            this._firingPosition = this.pickFiringPosition(player);
            this._repositionTimer = REPOSITION_INTERVAL_MIN + Math.random() * (REPOSITION_INTERVAL_MAX - REPOSITION_INTERVAL_MIN);
        }

        if (this._firingPosition && !this.followPathTo(this._firingPosition, deltaT)) return;

        // Arrived (or nowhere better to go): hold position until the next reposition
        this._firingPosition = null;
        this.stopAtTileCenter(deltaT);
    }

    /**
     * A nearby open tile from which the player is in sight and at a comfortable distance.
     * Returns null if there is none.
     */
    private pickFiringPosition(player: PlayerTank): Vector3 | null {
        const grid = GameScene.instance.navGrid;
        const here = grid.tileOf(this.position);
        const occupied = this.tilesOccupiedByOtherEnemies();
        const candidates: Vector3[] = [];

        for (let dy = -REPOSITION_SEARCH_RADIUS; dy <= REPOSITION_SEARCH_RADIUS; dy++) {
            for (let dx = -REPOSITION_SEARCH_RADIUS; dx <= REPOSITION_SEARCH_RADIUS; dx++) {
                const x = here.x + dx;
                const y = here.y + dy;
                if ((dx === 0 && dy === 0) || !grid.isWalkable(x, y) || grid.wallsAround(x, y) > 1) continue;
                if (occupied.has(`${x},${y}`)) continue;

                const tile = new Vector3(x, y, 0);
                const distance = tile.distanceTo(player.position);
                if (distance < MIN_FIRING_DISTANCE || distance > ENGAGE_RANGE) continue;
                if (!grid.isSegmentClear(tile, player.position, SIGHT_RADIUS)) continue;
                candidates.push(tile);
            }
        }

        return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    }

    // ---- Combat helpers ----------------------------------------------------------------

    /** Where to aim so a bullet meets the player, assuming it keeps moving the same way. */
    private predictAimPoint(player: PlayerTank): Vector3 {
        const aim = player.position.clone();
        let time = this.position.distanceTo(aim) / BULLET_SPEED;

        for (let i = 0; i < 2; i++) {
            aim.copy(player.position).addScaledVector(this._playerVelocity, Math.min(time, MAX_LEAD_TIME));
            time = this.position.distanceTo(aim) / BULLET_SPEED;
        }
        aim.z = 0;

        // Leading into a wall is pointless; aim straight at the player instead
        return GameScene.instance.navGrid.isSegmentClear(this.position, aim, SIGHT_RADIUS)
            ? aim
            : player.position.clone();
    }

    /** The bullet's path from the barrel to the target must be free of walls and friendly tanks. */
    private hasClearShot(target: Vector3, angle: number): boolean {
        const muzzle = directionFromAngle(angle, MUZZLE_DISTANCE).add(this.position);
        if (!GameScene.instance.navGrid.isSegmentClear(muzzle, target, SIGHT_RADIUS)) return false;

        for (const entity of GameScene.instance.entities) {
            if (!(entity instanceof EnemyTank) || entity === this || entity.shouldDispose) continue;
            if (distanceToSegment2D(entity.position, this.position, target) < FRIENDLY_CLEARANCE) return false;
        }
        return true;
    }

    /** Turns the turret towards a world angle at limited speed. Returns the remaining error. */
    private rotateTurretTowards(worldAngle: number, deltaT: number): number {
        const current = this._rotation + this._turretMesh.rotation.z;
        this._turretRotation = stepAngleTowards(current, worldAngle, TURRET_ROTATION_SPEED * deltaT);
        this._turretMesh.rotation.z = wrapAngle(this._turretRotation - this._rotation);
        return Math.abs(wrapAngle(worldAngle - this._turretRotation));
    }

    // ---- Navigation --------------------------------------------------------------------

    /**
     * Follows an A* path to `goal`, re-planning as needed. Returns true once arrived; the tank then
     * stands exactly on the goal's tile centre.
     *
     * Paths always start on a tile centre: when a re-plan is wanted while the tank is between two
     * tiles, it first finishes driving to the next tile centre on its current line and plans from
     * there, so it never has to slide sideways onto the new path.
     */
    private followPathTo(goal: Vector3, deltaT: number): boolean {
        this._navigationGoal.copy(goal);
        this._stopAtNextTile = false;
        this._repathTimer -= deltaT;

        const grid = GameScene.instance.navGrid;
        if (this._path.length === 0 || this._forceRepath) {
            this.planPath(goal);
        } else if (this._repathTimer <= 0
            || this._pathGridVersion !== grid.version
            || this.distance2D(this._pathGoal, goal) > GOAL_MOVED_DISTANCE) {
            this._replanAtNextTile = true;
        }

        if (this._pathFailed) return false;
        if (this._path.length === 0) return true; // Already on the goal's tile

        return this.driveAlongPath(deltaT);
    }

    /** Stops moving. If the tank is between two tiles it first drives on to the next tile centre. */
    private stopAtTileCenter(deltaT: number): void {
        if (this._path.length > 0) {
            this._stopAtNextTile = true;
            this.driveAlongPath(deltaT);
        }
        if (this._path.length === 0) this.resetProgress();
    }

    private planPath(goal: Vector3): void {
        const grid = GameScene.instance.navGrid;
        const occupied = this.tilesOccupiedByOtherEnemies();
        const steps = grid.findPath(this.position, goal, (x, y) => (occupied.has(`${x},${y}`) ? OCCUPIED_TILE_COST : 0));

        this._pathGoal.copy(goal);
        this._pathGridVersion = grid.version;
        this._repathTimer = REPATH_INTERVAL + Math.random() * 0.3; // Desync tanks
        this._forceRepath = false;
        this._replanAtNextTile = false;

        this._pathFailed = steps === null;
        this._path = steps ? NavGrid.toLegs(steps) : [];
    }

    private tilesOccupiedByOtherEnemies(): Set<string> {
        const grid = GameScene.instance.navGrid;
        const tiles = new Set<string>();
        for (const entity of GameScene.instance.entities) {
            if (entity instanceof EnemyTank && entity !== this && !entity.shouldDispose) {
                const { x, y } = grid.tileOf(entity.position);
                tiles.add(`${x},${y}`);
            }
        }
        return tiles;
    }

    /**
     * Drives the current leg: first turns on the spot to the leg's heading (always one of the
     * 8 compass directions; an opposite heading is driven in reverse without turning), then
     * drives straight to the leg's end point, stopping exactly on it.
     * Returns true when the last leg is finished.
     */
    private driveAlongPath(deltaT: number): boolean {
        if (this._reverseTimer > 0) {
            // Unsticking: back up a little (along the current heading) before trying again
            this._reverseTimer -= deltaT;
            this.moveWithSlide(this.movementFor(-deltaT * 0.6));
            return false;
        }

        while (this._path.length > 0 && this.isLegFinished(this._path[0])) {
            this._path.shift();
        }
        const leg = this._path[0];
        if (!leg) return true;

        const pending = this._replanAtNextTile || this._stopAtNextTile;
        if (pending && this.isOnTileCenter()) {
            // On a tile centre: now it's safe to stop or switch to a new path
            this.snapToTileCenter();
            if (this._stopAtNextTile) {
                this._stopAtNextTile = false;
                this._replanAtNextTile = false;
                this._path = [];
                return true;
            }
            this.planPath(this._navigationGoal);
            if (this._pathFailed) return false;
            // Carry on with the new path in the same frame (no stutter); nothing is pending any more
            return this._path.length === 0 || this.driveAlongPath(deltaT);
        }

        // Turn on the spot to the leg's direction, or just reverse if it's the opposite way
        if (!this.steerTowards(leg.heading, BODY_ROTATION_SPEED * deltaT)) return false;

        const direction = directionFromAngle(leg.heading);
        const toEnd = leg.point.clone().sub(this.position).setZ(0);
        const along = toEnd.dot(direction);
        const lateral = toEnd.clone().sub(direction.clone().multiplyScalar(along));
        const maxStep = this._moveSpeed * deltaT;

        // Never overshoot the end of the leg; with a re-plan/stop pending, don't pass the next tile centre
        let forward = Math.min(maxStep, Math.max(0, along));
        if (pending) {
            const spacing = Math.abs(direction.x) > 0.1 && Math.abs(direction.y) > 0.1 ? Math.SQRT2 : 1;
            const toTileCenter = Math.max(0, along) % spacing;
            forward = Math.min(forward, spacing - toTileCenter < CENTER_EPSILON ? 0 : toTileCenter);
        }

        // Drift sideways back onto the grid line if the tank got pushed off it
        const maxCorrection = maxStep * LATERAL_CORRECTION;
        if (lateral.length() > maxCorrection) lateral.setLength(maxCorrection);

        this.moveWithSlide(direction.multiplyScalar(forward).add(lateral));
        this.checkProgress(deltaT);
        return false;
    }

    private isLegFinished(leg: PathStep): boolean {
        if (this.distance2D(this.position, leg.point) < CENTER_EPSILON) return true;
        // Clearly past the end (e.g. pushed along by a wall slide): don't drive back for it
        const direction = directionFromAngle(leg.heading);
        const along = (leg.point.x - this.position.x) * direction.x + (leg.point.y - this.position.y) * direction.y;
        return along < -PASSED_LEG_DISTANCE;
    }

    private isOnTileCenter(): boolean {
        return Math.abs(this.position.x - Math.round(this.position.x)) < CENTER_EPSILON
            && Math.abs(this.position.y - Math.round(this.position.y)) < CENTER_EPSILON;
    }

    /** Removes any tiny leftover offset so the tank stands exactly on its tile centre. */
    private snapToTileCenter(): void {
        const offset = new Vector3(Math.round(this.position.x) - this.position.x, Math.round(this.position.y) - this.position.y, 0);
        if (offset.lengthSq() > 0) this.applyMovement(offset);
    }

    /** Detects being stuck (e.g. against another tank) and backs up + re-plans. */
    private checkProgress(deltaT: number): void {
        this._driveTime += deltaT;
        if (this._driveTime < STUCK_CHECK_INTERVAL) return;

        if (this.distance2D(this.position, this._progressAnchor) < STUCK_DISTANCE) {
            this._reverseTimer = REVERSE_TIME;
            this._forceRepath = true;
        }
        this.resetProgress();
    }

    private resetProgress(): void {
        this._driveTime = 0;
        this._progressAnchor.copy(this.position);
    }

    private nearestRouteIndex(): number {
        let nearest = 0;
        this._route.forEach((point, i) => {
            if (this.distance2D(point, this.position) < this.distance2D(this._route[nearest], this.position)) nearest = i;
        });
        return nearest;
    }

    private distance2D(a: Vector3, b: Vector3): number {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }
}

export default TacticalEnemyTank;
