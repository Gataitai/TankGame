import { Quaternion, Vector3 } from "three";
import { Body, Sphere as SphereShape, Vec3 } from "cannon-es";
import type { EntityId } from "@2/ecs/Ecs";
import { PhysicsBody, Transform } from "@2/components/Spatial";
import { Disposable } from "@2/components/Visual";
import { Persistent, PlayerControl } from "@2/components/Gameplay";
import { CollisionGroups, PhysicsMaterials } from "@2/physics/PhysicsWorld";
import { game } from "@2/scene/Game";
import HitscanGun from "@2/weapons/HitscanGun";
import RocketLauncher from "@2/weapons/RocketLauncher";
import ViewModel from "@2/weapons/ViewModel";
import InputManager from "@2/scene/managers/InputManager";
import { PLAYER_MASS, PLAYER_RADIUS } from "@2/config";

/**
 * You. There is no mesh and no model: the camera sits in the player's head, so the only thing you
 * ever see of it is the weapon in your hands (see ViewModel).
 *
 * Physically it's a ball that doesn't roll, driven by setting its velocity directly, so it walks
 * exactly as fast as it wants and slides along walls instead of sticking to them. PlayerSystem
 * does the driving; nothing shoots back yet, so it isn't breakable.
 *
 * @param start where the player stands on the ground (the body is raised to rest on it)
 * @param yaw which way it faces to begin with
 */
export function spawnPlayer(start: Vector3, yaw = 0): EntityId {
    const { ecs, physics, camera } = game();
    const input = InputManager.instance;

    const entity = ecs.create();

    // No mesh, so unlike the props this transform owns its own vectors
    ecs.add(entity, Transform, {
        position: new Vector3(start.x, start.y, start.z + PLAYER_RADIUS),
        quaternion: new Quaternion(),
        scale: new Vector3(1, 1, 1),
    });

    const viewModel = new ViewModel();
    camera.viewRoot.add(viewModel.object);

    const control = ecs.add(entity, PlayerControl, {
        yaw,
        pitch: 0,
        weapons: [new HitscanGun(), new RocketLauncher()],
        weaponIndex: 0,
        viewModel,
        triggerHeld: false,
    });

    const body = new Body({
        mass: PLAYER_MASS,
        material: PhysicsMaterials.actor,
        collisionFilterGroup: CollisionGroups.actor,
        position: new Vec3(start.x, start.y, start.z + PLAYER_RADIUS),
        allowSleep: false,
        linearDamping: 0,
        fixedRotation: true,
    });
    body.addShape(new SphereShape(PLAYER_RADIUS));
    ecs.add(entity, PhysicsBody, { body });
    physics.add(entity, body);
    physics.trackSupport(body); // So isSupported() can answer whether we may jump

    // Weapon switching, and the cleanup that goes with it
    const unsubscribe = [
        input.onKeyDown("Digit1", () => selectWeapon(control, 0)),
        input.onKeyDown("Digit2", () => selectWeapon(control, 1)),
        input.onWheel((deltaY) => selectWeapon(control, control.weaponIndex + Math.sign(deltaY))),
    ];
    ecs.add(entity, Disposable, {
        dispose: () => {
            unsubscribe.forEach((off) => off());
            viewModel.dispose();
        },
    });

    ecs.add(entity, Persistent, true);
    return entity;
}

/** Puts a different weapon in the player's hands, keeping the view model in step. */
export function selectWeapon(control: PlayerControl, index: number): void {
    const count = control.weapons.length;
    const next = ((index % count) + count) % count;
    if (next === control.weaponIndex) return;

    control.weaponIndex = next;
    control.viewModel.select(next);
    game().hud.flash(control.weapons[next].name);
}
