// InputManager.ts (Revised)
import { Vector2 } from "three";

type KeyCallback = () => void;
type WheelCallback = (deltaY: number) => void;

class InputManager {
    private static _instance = new InputManager();
    public static get instance() {
        return this._instance;
    }

    private _keys: { [key: string]: boolean } = {};
    private _mouseDown = false;
    private _mousePosition = new Vector2();
    private _wheelDelta = 0;

    // Single callbacks instead of arrays
    private _keyDownCallbacks: { [key: string]: KeyCallback | undefined } = {};
    private _keyUpCallbacks: { [key: string]: KeyCallback | undefined } = {};
    private _mouseUpCallback?: KeyCallback;
    private _rightMouseUpCallback?: KeyCallback; // Right mouse
    private _wheelCallback?: WheelCallback;

    // Joystick variables
    private _joystickBase?: HTMLElement;
    private _joystickHandle?: HTMLElement;
    private _joystickActive = false;
    private _joystickVector = new Vector2();

    private constructor() {
        window.addEventListener("keydown", this.handleDomKeyDown);
        window.addEventListener("keyup", this.handleDomKeyUp);
        window.addEventListener("mousedown", this.handleDomMouseDownEvent);
        window.addEventListener("mouseup", this.handleDomMouseUpEvent);
        window.addEventListener("mousemove", this.handleDomMouseMoveEvent);
        window.addEventListener("wheel", this.handleDomWheelEvent);

        window.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Detect if the device is a phone or tablet
        if (this.isMobileOrTablet()) {
            this.setupJoystick();
        }
    }

    private isMobileOrTablet(): boolean {
        return (
            /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (window.innerWidth < 768)  // Optional: Screen width check for tablets/phones
        );
    }


    private handleDomKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        this._keys[key] = true;
        const callback = this._keyDownCallbacks[key];
        if (callback) {
            callback();
        }
    };

    private handleDomKeyUp = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        this._keys[key] = false;
        const callback = this._keyUpCallbacks[key];
        if (callback) {
            callback();
        }
    };

    private handleDomMouseDownEvent = (e: MouseEvent) => {
        if (e.button === 0) {
            this._mouseDown = true;
        }
    };

    private handleDomMouseUpEvent = (e: MouseEvent) => {
        if (e.button === 0) {
            this._mouseDown = false;
            if (this._mouseUpCallback) this._mouseUpCallback();
        } else if (e.button === 2) {
            // Right mouse up
            if (this._rightMouseUpCallback) this._rightMouseUpCallback();
        }
    };

    private handleDomMouseMoveEvent = (event: MouseEvent) => {
        const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        this._mousePosition.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._mousePosition.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    private handleDomWheelEvent = (event: WheelEvent) => {
        this._wheelDelta = event.deltaY;
        if (this._wheelCallback) {
            this._wheelCallback(this._wheelDelta);
        }
    };


    // Joystick Setup
    private setupJoystick(): void {
        // Prevent duplicate joysticks
        if (this._joystickBase || window.innerWidth >= 768) return;

        // Create the joystick base and handle
        this._joystickBase = document.createElement("div");
        this._joystickHandle = document.createElement("div");

        this._joystickBase.classList.add("joystick-base");
        this._joystickHandle.classList.add("joystick-handle");

        // Append the handle to the base
        this._joystickBase.appendChild(this._joystickHandle);
        document.body.appendChild(this._joystickBase);

        // Attach touch event listeners
        this._joystickBase.addEventListener("touchstart", this.startJoystick);
        this._joystickBase.addEventListener("touchmove", this.moveJoystick);
        this._joystickBase.addEventListener("touchend", this.endJoystick);
    }

    private startJoystick = (e: TouchEvent) => {
        this._joystickActive = true;
        this.updateJoystickPosition(e.touches[0]);
    };

    private moveJoystick = (e: TouchEvent) => {
        if (this._joystickActive) {
            this.updateJoystickPosition(e.touches[0]);
            this.simulateKeyPressFromJoystick();
        }
    };

    private endJoystick = () => {
        this._joystickActive = false;
        this._joystickVector.set(0, 0);
        this.resetKeyStates();

        if (this._joystickHandle) {
            this._joystickHandle.style.transition = "transform 0.1s ease-out";
            this._joystickHandle.style.transform = `translate(-50%, -50%)`;
            setTimeout(() => this._joystickHandle!.style.transition = "", 100);
        }
    };

    private updateJoystickPosition(touch: Touch) {
        const rect = this._joystickBase!.getBoundingClientRect();
        const dx = touch.clientX - rect.left - rect.width / 2;
        const dy = touch.clientY - rect.top - rect.height / 2;

        // Limit the handle's movement to within the joystick base's radius
        const maxDistance = rect.width / 2;  // Half of the base's size
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Clamp the handle position to stay within the base circle
        const clampedDistance = Math.min(distance, maxDistance);
        const angle = Math.atan2(dy, dx);

        const offsetX = Math.cos(angle) * clampedDistance;
        const offsetY = Math.sin(angle) * clampedDistance;

        // Move the joystick handle based on calculated offsets
        this._joystickHandle!.style.transform = `translate(${offsetX}px, ${offsetY}px) translate(-50%, -50%)`;

        // Normalize the joystick vector for directional input
        this._joystickVector.set(offsetX / maxDistance, offsetY / maxDistance);
    }

    private simulateKeyPressFromJoystick(): void {
        const threshold = 0.3;

        this.resetKeyStates();  // Reset all keys before setting new ones

        if (this._joystickVector.y < -threshold) this.simulateKeyDown("w");
        if (this._joystickVector.y > threshold) this.simulateKeyDown("s");
        if (this._joystickVector.x < -threshold) this.simulateKeyDown("a");
        if (this._joystickVector.x > threshold) this.simulateKeyDown("d");
    }

    private simulateKeyDown(key: string): void {
        // Simulate key press and trigger the associated callback
        this._keys[key] = true;
        const callback = this._keyDownCallbacks[key];
        if (callback) {
            callback();
        }
    }


    private resetKeyStates(): void {
        ["w", "a", "s", "d"].forEach((key) => {
            this._keys[key] = false;
            if (this._keyUpCallbacks[key]) {
                this._keyUpCallbacks[key]!();
            }
        });
    }

    public get mouseDown(): boolean {
        return this._mouseDown;
    }

    public get mousePosition(): Vector2 {
        return this._mousePosition;
    }

    public resetWheelDelta() {
        this._wheelDelta = 0;
    }

    // Set or overwrite the keypress callback for a given key
    public onKeyPress(key: string, callback: KeyCallback): void {
        const lowerKey = key.toLowerCase();
        this._keyDownCallbacks[lowerKey] = callback;
    }

    // Set or overwrite the keyup callback for a given key
    public onKeyUp(key: string, callback: KeyCallback): void {
        const lowerKey = key.toLowerCase();
        this._keyUpCallbacks[lowerKey] = callback;
    }

    // Set or overwrite the single mouse up callback
    public onMouseUp(callback: KeyCallback): void {
        this._mouseUpCallback = callback;
    }

    public onRightMouseUp(callback: KeyCallback): void {
        this._rightMouseUpCallback = callback;
    }

    // Set or overwrite the single wheel callback
    public onWheelEvent(callback: WheelCallback): void {
        this._wheelCallback = callback;
    }

    // Removal methods
    public offKeyPress(key: string): void {
        const lowerKey = key.toLowerCase();
        if (this._keyDownCallbacks[lowerKey]) {
            this._keyDownCallbacks[lowerKey] = undefined;
        }
    }

    public offKeyUp(key: string): void {
        const lowerKey = key.toLowerCase();
        if (this._keyUpCallbacks[lowerKey]) {
            this._keyUpCallbacks[lowerKey] = undefined;
        }
    }

    public offMouseUp(): void {
        this._mouseUpCallback = undefined;
    }

    public offRightMouseUp(): void {
        this._rightMouseUpCallback = undefined;
    }

    public offWheelEvent(): void {
        this._wheelCallback = undefined;
    }

    public dispose(): void {
        window.removeEventListener("keydown", this.handleDomKeyDown);
        window.removeEventListener("keyup", this.handleDomKeyUp);
        window.removeEventListener("mousedown", this.handleDomMouseDownEvent);
        window.removeEventListener("mouseup", this.handleDomMouseUpEvent);
        window.removeEventListener("mousemove", this.handleDomMouseMoveEvent);
        window.removeEventListener("wheel", this.handleDomWheelEvent);
    }
}

export default InputManager;
