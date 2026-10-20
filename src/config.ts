// Central place for tuning values that were previously duplicated across files.

/** Playable area is MAP_SIZE x MAP_SIZE tiles, border walls included. */
export const MAP_SIZE = 25;

/** Size of the ground texture's area (larger than the map so the edges stay covered). */
export const GROUND_WIDTH = 44;
export const GROUND_HEIGHT = 33;
/**
 * The ground plane is this many times larger than GROUND_WIDTH x GROUND_HEIGHT, with the texture
 * mirrored outwards, so it also covers ultrawide (and portrait) screens. The middle part looks exactly
 * like before.
 */
export const GROUND_EXTENSION = 3;

/** Vertical size of the orthographic camera's view, in world units. */
export const ORTHO_FRUSTUM_SIZE = 20;
export const ORTHO_CAMERA_HEIGHT = 10;

/** Z position of wall centres (walls are 1x1x1 cubes resting on the ground). */
export const WALL_Z = 0.5;

/** Clamp for frame delta so a long stall doesn't make things tunnel through walls. */
export const MAX_FRAME_DELTA = 0.1;

// ---- Physics (cannon-es) ---------------------------------------------------------------
// One world unit is one wall tile; Z is up.

/** Downward acceleration. A bit stronger than real gravity so things feel snappy at this scale. */
export const GRAVITY = 15;

/** Largest physics step. Each frame is split into as many equal sub-steps as needed. */
export const PHYSICS_MAX_STEP = 1 / 120;

/** Seconds that pieces of broken objects stay around before shrinking away (randomised a bit). */
export const SHARD_LIFETIME = 8;

/** Most pieces that may exist at once; the oldest ones disappear early when there are more. */
export const MAX_SHARDS = 300;

/** Camera shake used when something gets hit. */
export const HIT_SHAKE = { duration: 0.3, intensity: 0.1 } as const;

/** Seconds the win/lose message stays up before the next level starts. */
export const LEVEL_TRANSITION_TIME = 2.5;

/**
 * Which enemy AI to use:
 * - "tactical": patrols the map, paths around walls and only shoots with a clear line of fire
 * - "basic": the original AI (random driving, shoots straight at the player)
 */
export const ENEMY_AI: "tactical" | "basic" = "tactical";
