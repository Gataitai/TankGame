// Central place for tuning values that were previously duplicated across files.

/** Playable area is MAP_SIZE x MAP_SIZE tiles, border walls included. */
export const MAP_SIZE = 25;

/** Size of the ground plane (larger than the map so the edges stay covered). */
export const GROUND_WIDTH = 44;
export const GROUND_HEIGHT = 33;

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
