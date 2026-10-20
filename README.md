# Tank Game

Tank Game inspired by Wii play tanks

## Controls
- **WASD** – Move the tank.
- **Mouse Movement** – Aim the turret.
- **Left Mouse Button** – Shoot bullets.
- **Right Mouse Button** – Place a landmine.
- **Scroll Wheel** – Switch between bullets and guided missiles.
- **1** – Toggle between the top-down camera and a free orbit camera (the game pauses while orbiting).

- **2** – Toggle the AI debug view: each enemy gets a coloured cone and matching patrol-waypoint dots, plus a line for its current path.
- **N** – Switch to the next scene: the battle or the physics playground.

## Scenes
- **Battle** – Destroy every enemy tank to advance to the next level; if your tank is destroyed you restart at level 1.
- **Physics playground** – No enemy AI, just things to try the physics on: a parkour of ramps and blocks (drive up to height 1 and 2 and back down), a jump ramp (top right, drive down over it at full speed), loose balls, crates, walls, dominoes and a pyramid to push around and knock over, glass walls, and two target tanks that don't fight back. Everything in it breaks when shot.

## Physics
The game uses [cannon-es](https://github.com/pmndrs/cannon-es) (`src/physics/`). Physics is part of `Entity`: any entity can have a `body`.
- A **static** body (mass 0) never moves: the ground, walls, and the parkour blocks.
- A **dynamic** body is simulated, and after every physics step the entity's mesh and collider follow it. Walls and blocks take a `dynamic` option, so any wall can be made pushable.
- **Tanks** have a dynamic body that doesn't rotate. They're driven by setting their velocity, so they push loose objects and other tanks out of the way, slide along walls, drive up ramps and fly off the end of the jump ramp. The model tilts to match the ground under it. When nothing is in the way a tank still ends up exactly where it wanted to go, which the enemy AI relies on.
- **Breaking**: `destructible` entities (tanks, breakable walls, props) break into pieces when destroyed; `fragile` ones already break from a single bullet. The pieces are cut from the entity's own mesh (`src/physics/Fracture.ts`), so they keep its texture, and the cut faces are filled in with the same texture. The pieces fly away from where it was hit, fall to the ground, and shrink away after a few seconds. Breakable walls shatter into lots of small pieces, like glass.
- Explosions push loose objects and pieces away.

All the wooden objects (walls, blocks, balls and ramps, in `src/entities/props/`) use the existing wall textures and are at most 1 by 2 tiles, like wooden building blocks.

## Enemy AI
Enemies (`TacticalEnemyTank`) know the layout of the map through a tile grid (`src/ai/NavGrid.ts`) that is updated as walls are added or destroyed.

Like the original AI, enemy tanks only drive in the 8 compass directions (N, NE, E, SE, S, SW, W, NW) and turn on the spot at the corners of their path.

- **Patrolling** – Each tank drives its own loop of waypoints around the map (`src/ai/PatrolRoute.ts`), pausing at each one to scan with its turret.
- **Chasing** – When it can't see you but knows where you are (or were), it plans an A* path around the walls to you. It never fires into a wall. If it loses track of you, it searches your last known position before going back to patrolling.
- **Attacking** – With a clear line of sight it leads its shots based on your movement, holds its fire if a wall or a friendly tank is in the way, and closes in when you're far away.

The original simple AI is still available as `BasicEnemyTank`; switch with `ENEMY_AI` in `src/config.ts`.

## Installation and Running the Game
1. Clone this repository:
   ```bash
   git clone https://github.com/Gataitai/TankGame.git
   cd tankgame
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the game:
   ```bash
   npm run build
   ```

4. Run the game:
   ```bash
   npm run preview
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:4173
   ```

## Technologies Used
- **Three.js** – For rendering 3D graphics.
- **cannon-es** – Physics.
- **TypeScript** – Core game logic and development

## Project Structure
- `src/scene/GameScene.ts` – Game loop, level flow, scene switching and `spawn()`, the single entry point for adding entities.
- `src/scene/managers/` – Entities, physics stepping & collision queries, input, camera and lighting.
- `src/scene/stages/` – The scenes: the battle levels and the physics playground.
- `src/physics/` – The cannon-es world, and breaking meshes into pieces.
- `src/entities/` – Tanks, weapons (strategies), projectiles, props and shards.
- `src/effects/` – Short-lived visual effects.
- `src/map/` – Ground, walls and the tread-mark canvas. The ground is mirrored outwards so it also covers ultrawide screens.
- `src/config.ts` – Shared tuning constants.
