// Central place for tuning values that were previously duplicated across files.

/** Playable area is MAP_SIZE x MAP_SIZE tiles, border walls included. */
export const MAP_SIZE = 25;

/**
 * The ground texture covers one GROUND_TILE_WIDTH x GROUND_TILE_HEIGHT tile centred on the map.
 * The ground plane is GROUND_TILES x GROUND_TILES of those tiles (mirrored at each edge so they
 * join seamlessly), so even ultra-wide screens never see past it. Keep GROUND_TILES odd with an
 * even middle index (1, 5, 9, 13...) so the centre tile isn't mirrored.
 */
export const GROUND_TILE_WIDTH = 44;
export const GROUND_TILE_HEIGHT = 33;
export const GROUND_TILES = 9;

/** Vertical size of the orthographic camera's view, in world units. */
export const ORTHO_FRUSTUM_SIZE = 20;
export const ORTHO_CAMERA_HEIGHT = 10;

/** Z position of wall centres (walls are 1x1x1 cubes resting on the ground). */
export const WALL_Z = 0.5;

/** Height above the ground at which projectiles travel. */
export const PROJECTILE_Z = 0.5;

/** Clamp for frame delta so a long stall doesn't make things tunnel through walls. */
export const MAX_FRAME_DELTA = 0.1;

/** Camera shake used when something gets hit. */
export const HIT_SHAKE = { duration: 0.3, intensity: 0.1 } as const;

/** Seconds the win/lose message stays up before the next level starts. */
export const LEVEL_TRANSITION_TIME = 2.5;

/** Arena scene (GameScene2) settings. */
export const ARENA = {
    /** Random wall segments to place (each 2-5 walls long). */
    wallSegments: 16,
    /** Chance for each wall segment to be breakable. */
    breakableChance: 0.4,
    startEnemies: 3,
    maxEnemies: 6,
    /** Seconds between enemy spawns while below maxEnemies. */
    spawnInterval: 5,
    /** Enemies never spawn closer to the player than this. */
    minSpawnDistance: 9,
    /** Seconds before the arena restarts after the player is destroyed. */
    restartDelay: 3,
} as const;

/**
 * Which enemy AI to use:
 * - "tactical": patrols the map, paths around walls and only shoots with a clear line of fire
 * - "basic": the original AI (random driving, shoots straight at the player)
 */
export const ENEMY_AI: "tactical" | "basic" = "tactical";

/** Physics simulation (cannon-es). One world unit is one tile, roughly a metre. */
export const PHYSICS = {
    /** Downwards acceleration in world units per second squared. */
    gravity: 9.81,
    /** The simulation runs in fixed steps of this many seconds (several per frame if needed). */
    fixedTimeStep: 1 / 120,
    maxSubSteps: 10,
    /** More iterations = more stable stacking, at a small cost. */
    solverIterations: 20,
    /** Default surface settings for contacts. */
    friction: 0.5,
    restitution: 0.1,
    /** Safety cap on how fast a physics body can move, so extreme hits can't destabilise the simulation. */
    maxSpeed: 30,
} as const;

/** Ball arena scene (GameScene3) settings. */
export const BALL_ARENA = {
    enemies: 2,
    /** Seconds before a destroyed enemy is replaced. */
    respawnDelay: 4,
    /** Seconds before the scene restarts after the player is destroyed. */
    restartDelay: 3,
} as const;
