import { Vector2, Vector3 } from "three";
import type System from "@2/ecs/System";
import { PhysicsBody, Transform } from "@2/components/Spatial";
import { PlayerControl } from "@2/components/Gameplay";
import type { Shot } from "@2/weapons/WeaponStrategy";
import type { ViewTarget } from "@2/scene/cameraStrategies/CameraStrategy";
import InputManager from "@2/scene/managers/InputManager";
import { game } from "@2/scene/Game";
import { clamp, directionFromYawPitch } from "@2/utils/MathUtils";
import {
    AIR_CONTROL,
    EYE_HEIGHT,
    JUMP_SPEED,
    MAX_PITCH,
    MOUSE_SENSITIVITY,
    SPRINT_SPEED,
    WALK_SPEED,
} from "@2/config";

/** How quickly a course change takes effect while in the air. */
const AIR_BLEND_RATE = 8;

const _move = new Vector3();
const _forward = new Vector3();
const _right = new Vector3();

/**
 * Turns the keyboard and mouse into looking around, walking, jumping and shooting.
 *
 * It runs before PhysicsSystem, so the velocity it writes is what the simulation then integrates.
 * The yaw and pitch live on PlayerControl rather than on the camera: the camera only follows the
 * view this system publishes (see World and FirstPersonStrategy).
 */
class PlayerSystem implements System {
    public readonly name = "player";

    private readonly _input = InputManager.instance;
    private readonly _mouseDelta = new Vector2();
    private readonly _view: ViewTarget = { position: new Vector3(), yaw: 0, pitch: 0 };
    private readonly _shot: Shot = {
        origin: new Vector3(),
        direction: new Vector3(),
        muzzle: new Vector3(),
    };
    private _hasView = false;
    private _weaponName = "";

    /** Where the camera should be and which way it should look. The object is reused. */
    public get view(): ViewTarget | null {
        return this._hasView ? this._view : null;
    }

    /** The name of the weapon in hand, for the HUD. */
    public get weaponName(): string {
        return this._weaponName;
    }

    public update(deltaT: number): void {
        const { ecs } = game();
        this._hasView = false;
        this._weaponName = "";

        ecs.each(PlayerControl, (entity, control) => {
            const transform = ecs.get(entity, Transform);
            const body = ecs.get(entity, PhysicsBody)?.body;
            if (!transform) return;

            this.look(control);
            this.drive(control, body, deltaT);

            for (const weapon of control.weapons) weapon.update(deltaT);
            this._weaponName = control.weapons[control.weaponIndex].name;
            this.publishView(control, transform.position);
            this.pullTrigger(control);
            control.viewModel.update(deltaT);
        });
    }

    // ---- Looking -------------------------------------------------------------------------

    private look(control: PlayerControl): void {
        this._input.consumeMouseDelta(this._mouseDelta);
        if (this._mouseDelta.x === 0 && this._mouseDelta.y === 0) return;

        control.yaw = (control.yaw - this._mouseDelta.x * MOUSE_SENSITIVITY) % (Math.PI * 2);
        control.pitch = clamp(
            control.pitch - this._mouseDelta.y * MOUSE_SENSITIVITY,
            -MAX_PITCH,
            MAX_PITCH,
        );
    }

    private publishView(control: PlayerControl, position: Vector3): void {
        this._view.position.set(position.x, position.y, position.z + EYE_HEIGHT);
        this._view.yaw = control.yaw;
        this._view.pitch = control.pitch;
        this._hasView = true;
    }

    // ---- Walking -------------------------------------------------------------------------

    private drive(control: PlayerControl, body: PhysicsBody["body"] | undefined, deltaT: number): void {
        if (!body) return;

        const input = this._input;
        // Releasing the mouse (leaving pointer lock) stops the player, which doubles as a pause
        const active = input.pointerLocked;
        const held = (code: string) => (active && input.isKeyDown(code) ? 1 : 0);

        const forward = held("KeyW") - held("KeyS");
        const strafe = held("KeyD") - held("KeyA");
        const speed = held("ShiftLeft") ? SPRINT_SPEED : WALK_SPEED;

        _move.set(0, 0, 0);
        if (forward !== 0 || strafe !== 0) {
            _forward.set(Math.cos(control.yaw), Math.sin(control.yaw), 0);
            _right.set(Math.sin(control.yaw), -Math.cos(control.yaw), 0);
            _move.addScaledVector(_forward, forward)
                .addScaledVector(_right, strafe)
                .normalize()
                .multiplyScalar(speed);
        }

        // On the ground you move exactly as fast as you ask; in the air you only nudge your course
        const supported = game().physics.isSupported(body);
        const blend = supported ? 1 : 1 - Math.exp(-AIR_CONTROL * AIR_BLEND_RATE * deltaT);
        body.velocity.x += (_move.x - body.velocity.x) * blend;
        body.velocity.y += (_move.y - body.velocity.y) * blend;

        if (supported && held("Space")) body.velocity.z = JUMP_SPEED;
    }

    // ---- Shooting ------------------------------------------------------------------------

    private pullTrigger(control: PlayerControl): void {
        const weapon = control.weapons[control.weaponIndex];
        const down = this._input.pointerLocked && this._input.mouseDown;
        const pull = down && (weapon.automatic || !control.triggerHeld);
        control.triggerHeld = down;
        if (!pull) return;

        // Aim from the eyes, so shots go exactly where the crosshair points
        this._shot.origin.copy(this._view.position);
        directionFromYawPitch(control.yaw, control.pitch, this._shot.direction);
        control.viewModel.muzzleWorldPosition(control.weaponIndex, this._shot.muzzle);

        if (weapon.fire(this._shot)) control.viewModel.kick(weapon.recoil);
    }
}

export default PlayerSystem;
