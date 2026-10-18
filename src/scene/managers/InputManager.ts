import { Vector2 } from "three";

type Listener = () => void;
type WheelListener = (deltaY: number) => void;
export type Unsubscribe = () => void;

const JOYSTICK_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"] as const;

/**
 * Central keyboard / mouse / touch input.
 *
 * Keys are identified by KeyboardEvent.code ("KeyW", "Digit1", ...), which refers to the
 * physical key, so WASD works on AZERTY and other layouts too.
 * Every `on...` method supports multiple listeners and returns an unsubscribe function.
 */
class InputManager {
    private static _instance = new InputManager();
    public static get instance() {
        return this._instance;
    }

    private _pressed = new Set<string>();
    private _mouseDown = false;
    private _mousePosition = new Vector2();
    private _target: HTMLElement | null = null;

    private _keyDownListeners = new Map<string, Set<Listener>>();
    private _keyUpListeners = new Map<string, Set<Listener>>();
    private _mouseUpListeners = new Set<Listener>();
    private _rightMouseUpListeners = new Set<Listener>();
    private _wheelListeners = new Set<WheelListener>();

    // Touch joystick
    private _joystickBase?: HTMLElement;
    private _joystickHandle?: HTMLElement;
    private _joystickActive = false;
    private _joystickVector = new Vector2();

    private constructor() {
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("blur", this.handleBlur);
        window.addEventListener("mousedown", this.handleMouseDown);
        window.addEventListener("mouseup", this.handleMouseUp);
        window.addEventListener("mousemove", this.handleMouseMove);
        window.addEventListener("wheel", this.handleWheel);
        window.addEventListener("contextmenu", this.preventContextMenu);

        if (this.isMobileOrTablet()) {
            this.setupJoystick();
        }
    }

    /** Mouse coordinates are reported relative to this element (the game canvas). */
    public attach(element: HTMLElement): void {
        this._target = element;
    }

    // ---- Queries -------------------------------------------------------------------------

    public isKeyDown(code: string): boolean {
        return this._pressed.has(code);
    }

    public get mouseDown(): boolean {
        return this._mouseDown;
    }

    /** Mouse position in normalised device coordinates (-1..1) relative to the attached element. */
    public get mousePosition(): Vector2 {
        return this._mousePosition;
    }

    // ---- Subscriptions -------------------------------------------------------------------

    public onKeyDown(code: string, listener: Listener): Unsubscribe {
        return InputManager.subscribe(InputManager.listenersFor(this._keyDownListeners, code), listener);
    }

    public onKeyUp(code: string, listener: Listener): Unsubscribe {
        return InputManager.subscribe(InputManager.listenersFor(this._keyUpListeners, code), listener);
    }

    public onMouseUp(listener: Listener): Unsubscribe {
        return InputManager.subscribe(this._mouseUpListeners, listener);
    }

    public onRightMouseUp(listener: Listener): Unsubscribe {
        return InputManager.subscribe(this._rightMouseUpListeners, listener);
    }

    public onWheel(listener: WheelListener): Unsubscribe {
        return InputManager.subscribe(this._wheelListeners, listener);
    }

    public dispose(): void {
        window.removeEventListener("keydown", this.handleKeyDown);
        window.removeEventListener("keyup", this.handleKeyUp);
        window.removeEventListener("blur", this.handleBlur);
        window.removeEventListener("mousedown", this.handleMouseDown);
        window.removeEventListener("mouseup", this.handleMouseUp);
        window.removeEventListener("mousemove", this.handleMouseMove);
        window.removeEventListener("wheel", this.handleWheel);
        window.removeEventListener("contextmenu", this.preventContextMenu);
        this._joystickBase?.remove();
    }

    // ---- DOM handlers --------------------------------------------------------------------

    private handleKeyDown = (e: KeyboardEvent) => {
        this._pressed.add(e.code);
        // Ignore auto-repeat so toggles (like the camera key) don't flicker when held.
        if (!e.repeat) InputManager.emit(this._keyDownListeners.get(e.code));
    };

    private handleKeyUp = (e: KeyboardEvent) => {
        this._pressed.delete(e.code);
        InputManager.emit(this._keyUpListeners.get(e.code));
    };

    /** Keys released while the window is unfocused never send keyup, so forget them. */
    private handleBlur = () => {
        this._pressed.clear();
        this._mouseDown = false;
    };

    private handleMouseDown = (e: MouseEvent) => {
        if (e.button === 0) this._mouseDown = true;
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (e.button === 0) {
            this._mouseDown = false;
            InputManager.emit(this._mouseUpListeners);
        } else if (e.button === 2) {
            InputManager.emit(this._rightMouseUpListeners);
        }
    };

    private handleMouseMove = (e: MouseEvent) => {
        const rect = (this._target ?? document.documentElement).getBoundingClientRect();
        this._mousePosition.set(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
    };

    private handleWheel = (e: WheelEvent) => {
        for (const listener of [...this._wheelListeners]) listener(e.deltaY);
    };

    private preventContextMenu = (e: Event) => e.preventDefault();

    // ---- Touch joystick (simulates WASD) -------------------------------------------------

    private isMobileOrTablet(): boolean {
        return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || window.innerWidth < 768;
    }

    private setupJoystick(): void {
        if (this._joystickBase) return;

        this._joystickBase = document.createElement("div");
        this._joystickHandle = document.createElement("div");
        this._joystickBase.classList.add("joystick-base");
        this._joystickHandle.classList.add("joystick-handle");
        this._joystickBase.appendChild(this._joystickHandle);
        document.body.appendChild(this._joystickBase);

        this._joystickBase.addEventListener("touchstart", this.startJoystick);
        this._joystickBase.addEventListener("touchmove", this.moveJoystick);
        this._joystickBase.addEventListener("touchend", this.endJoystick);
    }

    private startJoystick = (e: TouchEvent) => {
        this._joystickActive = true;
        this.updateJoystick(e.touches[0]);
    };

    private moveJoystick = (e: TouchEvent) => {
        if (this._joystickActive) this.updateJoystick(e.touches[0]);
    };

    private endJoystick = () => {
        this._joystickActive = false;
        this._joystickVector.set(0, 0);
        this.applyJoystickKeys();

        const handle = this._joystickHandle;
        if (handle) {
            handle.style.transition = "transform 0.1s ease-out";
            handle.style.transform = "translate(-50%, -50%)";
            setTimeout(() => (handle.style.transition = ""), 100);
        }
    };

    private updateJoystick(touch: Touch): void {
        const rect = this._joystickBase!.getBoundingClientRect();
        const dx = touch.clientX - rect.left - rect.width / 2;
        const dy = touch.clientY - rect.top - rect.height / 2;

        // Keep the handle inside the base circle
        const maxDistance = rect.width / 2;
        const distance = Math.min(Math.hypot(dx, dy), maxDistance);
        const angle = Math.atan2(dy, dx);
        const offsetX = Math.cos(angle) * distance;
        const offsetY = Math.sin(angle) * distance;

        this._joystickHandle!.style.transform = `translate(${offsetX}px, ${offsetY}px) translate(-50%, -50%)`;
        this._joystickVector.set(offsetX / maxDistance, offsetY / maxDistance);
        this.applyJoystickKeys();
    }

    private applyJoystickKeys(): void {
        const threshold = 0.3;
        const v = this._joystickVector;
        JOYSTICK_KEYS.forEach((key) => this._pressed.delete(key));
        if (v.y < -threshold) this._pressed.add("KeyW");
        if (v.y > threshold) this._pressed.add("KeyS");
        if (v.x < -threshold) this._pressed.add("KeyA");
        if (v.x > threshold) this._pressed.add("KeyD");
    }

    // ---- Helpers -------------------------------------------------------------------------

    private static listenersFor(map: Map<string, Set<Listener>>, code: string): Set<Listener> {
        let set = map.get(code);
        if (!set) {
            set = new Set();
            map.set(code, set);
        }
        return set;
    }

    private static subscribe<T>(set: Set<T>, listener: T): Unsubscribe {
        set.add(listener);
        return () => {
            set.delete(listener);
        };
    }

    private static emit(listeners: Set<Listener> | undefined): void {
        if (!listeners) return;
        // Copy so listeners can unsubscribe while being called
        for (const listener of [...listeners]) listener();
    }
}

export default InputManager;
