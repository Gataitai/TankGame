# Tank Game

Tank Game inspired by Wii play tanks

## Controls
- **WASD** – Move the tank. Drive into another tank or a physics object to push it.
- **Space** – Jump (land on walls, boxes or other tanks).
- **Mouse Movement** – Aim the turret.
- **Left Mouse Button** – Shoot bullets.
- **Right Mouse Button** – Place a landmine.
- **Scroll Wheel** – Switch between bullets and guided missiles.
- **1** – Toggle between the top-down camera and a free orbit camera (the game pauses while orbiting).

- **2** – Toggle the AI debug view: each enemy gets a coloured cone and matching patrol-waypoint dots, plus a line for its current path.

- **N** – Switch between scenes (level mode / arena mode / ball arena / construction site).

## Scenes
- **Level mode** (`GameScene`) – Destroy every enemy tank to advance to the next level; if your tank is destroyed you restart at level 1.
- **Arena mode** (`GameScene2`) – One map with randomly placed walls. Enemies spawn at random spots away from you and keep coming; the top-right corner counts your kills. Getting destroyed generates a new arena.
- **Ball arena** (`GameScene3`) – An open map with a physics ball. Drive into the ball to push it, shoot it to kick it away (shots still explode on it), and landmine blasts throw it around. It rolls, bounces off walls and the ground, and is pushed by enemy tanks too.
- **Construction site** (`GameScene4`) – No enemies; two pillars with a bridge on top, all simulated with physics. Push them over or shoot/mine them to shatter them; the pieces stay on the ground. **R** rebuilds the construction and sweeps up the pieces.

Open the game with `?scene=arena`, `?scene=ball` or `?scene=construction` (e.g. `http://localhost:5173/?scene=construction`) to start in that scene.

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
- **cannon-es** – Physics simulation.
- **TypeScript** – Core game logic and development

## Project Structure
- `src/core/Game.ts` – The engine: renderer, game loop, HUD, pausing; runs one scene at a time.
- `src/scene/Scene.ts` – Base class for scenes. A scene holds its entities, camera, lights and the AI's map grid (like a Unity scene). Entities reach it through `entity.scene` to add other entities (`scene.add(...)`), find entities (`scene.find(PlayerTank)`) or query collisions.
- `src/scene/GameScene.ts`, `src/scene/GameScene2.ts` – The level mode and arena mode scenes; they only describe their content (`onLoad`) and rules (`onUpdate`).
- `src/scene/managers/` – Entities & collision queries, input, camera, lighting and level layouts.
- `src/entities/` – Tanks, weapons (strategies) and projectiles.
- `src/effects/` – Short-lived visual effects.
- `src/physics/` – Physics, built on [cannon-es](https://github.com/pmndrs/cannon-es).
  - Every entity can have physics. Choose it when instantiating: `scene.add(entity, { physics: "static" | "dynamic" | "none" })` (static = immovable, dynamic = simulated). Without the option the class's `defaultPhysics` is used (walls are static; tanks, `PhysicsBall` and `PhysicsBox` are dynamic; everything else has none). Switch at any time with `entity.setPhysics(mode)`, e.g. to make a wall fall over.
  - `entity.rigidbody` (a `RigidBody`) gives access to the body: velocity, impulses, `isGrounded`. Override `describePhysics()` for a different shape, mass or surface (the default is a box around the mesh).
  - `PhysicsWorld` is a scene's simulation (`scene.physics`): the ground, invisible arena bounds, and all bodies. Tanks are dynamic, upright cylinders driven by setting their velocity, so they push and get pushed, fall, jump and land on things.
  - `ObjectBreaker` (`scene.breaker`) shatters entities that have `breakSettings`: each of their meshes (e.g. a tank's body and turret) is cracked along random planes into pieces that keep the original materials and fit together like broken glass (`MeshPart`); every piece becomes a `Fragment` that fly apart from the impact and fall to the ground, then either disappear (`lifetime` in seconds) or stay (`lifetime: null`). Call `entity.break(impact)`; projectiles do this for things with `breaksOnImpact`. Destroyed tanks and breakable walls shatter with disappearing pieces; `new PhysicsBox(position, size, { breakable: true, keepPieces: true })` keeps its pieces.
- `src/map/` – Ground, walls, the tread-mark canvas, the shared map builder and the random wall generator.
- `src/config.ts` – Shared tuning constants.
