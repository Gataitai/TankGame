// Central place for tuning values that are shared across the sandbox.
// One world unit is one tile, and Z is up.

/** Props are scattered over roughly MAP_SIZE x MAP_SIZE tiles. The ground reaches much further. */
export const MAP_SIZE = 48;

/** Size of the visible ground plane. Big enough that the fog hides its edge. */
export const GROUND_SIZE = 400;

/** Z position of a 1x1x1 block resting on the ground. */
export const BLOCK_Z = 0.5;

/** Clamp for the frame delta so a long stall doesn't make things tunnel through each other. */
export const MAX_FRAME_DELTA = 0.1;

// ---- Physics (cannon-es) ---------------------------------------------------------------

/** Downward acceleration. Stronger than real gravity so things feel snappy at this scale. */
export const GRAVITY = 20;

/**
 * Largest physics step. Each frame is split into as many equal sub-steps as needed, so this is
 * really "how many times per frame the simulation runs": at 1/120 every 60fps frame costs two full
 * solves. Projectiles are swept rays rather than bodies (see MotionSystem), so nothing needs the
 * finer step, and one solve per frame is half the work.
 */
export const PHYSICS_MAX_STEP = 1 / 60;

/**
 * Solver passes per step. Fewer means contacts are resolved less exactly — a deep pile of debris
 * settles a little more softly — and costs proportionally less. cannon-es defaults to 10.
 */
export const PHYSICS_SOLVER_ITERATIONS = 6;

// ---- Breaking things -------------------------------------------------------------------

/**
 * Milliseconds per frame the break queue may spend cutting meshes into pieces.
 *
 * This is what keeps a big explosion from stalling a frame. Cutting a mesh up and building a
 * geometry and a physics body for every piece is far too much work to do for a dozen objects at
 * once, so it is spread over the next few frames instead. At least one object is always broken per
 * frame, however tight the budget.
 *
 * Lowering it stretches a big explosion over more frames, but measuring says that barely helps:
 * what a huge blast really costs is the pieces existing and colliding once they are there, not the
 * cutting. So this is set to finish quickly and keep the rubble responsive.
 */
export const BREAK_BUDGET_MS = 2.5;

/** Objects waiting to be broken. Past this they are removed without leaving pieces. */
export const MAX_BREAK_QUEUE = 32;

/**
 * Most pieces of broken things that may exist at once; the oldest shrink away early.
 *
 * Pieces collide as boxes so they tumble and settle instead of rolling like marbles, and box-on-box
 * is the expensive test, so this number is what a big explosion costs. Measured on one blast, over
 * the seven seconds it takes to fly, land and settle:
 *
 *     100 pieces   2.43 ms/frame avg,  33 ms worst,   4 frames over budget
 *     160 pieces   2.56 ms/frame avg,  34 ms worst,   4 frames over budget
 *     220 pieces   3.73 ms/frame avg,  52 ms worst,  12 frames over budget
 *     300 pieces   5.43 ms/frame avg,  60 ms worst,  21 frames over budget
 *
 * The cost is flat up to about 160 and climbs steeply after, because pieces in a pile all touch
 * each other. Raise it for deeper rubble and a rougher moment right after an explosion. Rubble at
 * rest is nearly free either way: a settled pile of this size costs about 1.2 ms a frame.
 */
export const MAX_DEBRIS = 170;

/**
 * Hard ceiling on pieces, the ones already fading away included.
 *
 * MAX_DEBRIS only counts pieces still in their prime, and a retired piece takes half a second to
 * shrink out of existence. Without a second, absolute limit a burst of explosions piles up while
 * the retired ones are still on their way out — measured at 616 pieces against a cap of 300, which
 * is a stalled frame. Past this ceiling the most faded pieces are dropped immediately instead.
 */
export const MAX_DEBRIS_TOTAL = 200;

/**
 * Seconds a piece lies around before it shrinks away (randomised a little, so a pile doesn't
 * vanish all at once). Pieces are solid for all of that time, so this and MAX_DEBRIS together
 * decide how much rubble the simulation is carrying.
 */
export const DEBRIS_LIFETIME = 60;

// ---- Player ----------------------------------------------------------------------------

/** Radius of the player's physics ball. Under half a tile, so you fit through one-tile gaps. */
export const PLAYER_RADIUS = 0.35;

/** Height of the camera above the middle of the player's body. */
export const EYE_HEIGHT = 0.85;

export const PLAYER_MASS = 70;
export const WALK_SPEED = 5;
export const SPRINT_SPEED = 9;
export const JUMP_SPEED = 7.5;

/** Radians of rotation per pixel of mouse movement. */
export const MOUSE_SENSITIVITY = 0.0022;

/** Looking further up or down than this would flip the camera over. */
export const MAX_PITCH = Math.PI / 2 - 0.01;

/** How much of the walking speed you keep control of while in the air (0 = none, 1 = full). */
export const AIR_CONTROL = 0.5;

// ---- Feedback --------------------------------------------------------------------------

/** Camera shake used when something explodes. */
export const HIT_SHAKE = { duration: 0.25, intensity: 0.07 } as const;
