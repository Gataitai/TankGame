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

Destroy every enemy tank to advance to the next level; if your tank is destroyed you restart at level 1.

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
- **TypeScript** – Core game logic and development

## Project Structure
- `src/scene/GameScene.ts` – Game loop, level flow and `spawn()`, the single entry point for adding entities.
- `src/scene/managers/` – Entities & collision queries, input, camera, lighting and level building.
- `src/entities/` – Tanks, weapons (strategies) and projectiles.
- `src/effects/` – Short-lived visual effects.
- `src/map/` – Ground, walls and the tread-mark canvas.
- `src/config.ts` – Shared tuning constants.
