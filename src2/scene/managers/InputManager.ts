import { Vector2 } from "three";

type Listener = () => void;
type WheelListener = (deltaY: number) => void;
export type Unsubscribe = () => void;

/**
 * Central keyboard / mouse input for a first-person game.
 *
 * Looking around needs raw mouse movement rather than a cursor position, so the canvas is put in
 * pointer lock on click; while it's locked the cursor is hidden and every bit of movement is
 * accumulated into a delta that the player consumes once per frame.
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
    /** Mouse movement since the last time it was consumed, in pixels. */
    private _mouseDelta = new Vector2();
    private _target: HTMLElement | null = null;

    private _keyDownListeners = new Map<string, Set<Listener>>();
    private _keyUpListeners = new Map<string, Set<Listener>>();
    private _mouseDownListeners = new Set<Listener>();
    private _mouseUpListeners = new Set<Listener>();
    private _wheelListeners = new Set<WheelListener>();
    private _pointerLockListeners = new Set<Listener>();

    private constructor() {
        window.addEventListener("keydown", this.handleKeyDown);
        window.addEventListener("keyup", this.handleKeyUp);
        window.addEventListener("blur", this.handleBlur);
        window.addEventListener("mousedown", this.handleMouseDown);
        window.addEventListener("mouseup", this.handleMouseUp);
        window.addEventListener("mousemove", this.handleMouseMove);
        window.addEventListener("wheel", this.handleWheel, { passive: true });
        window.addEventListener("contextmenu", this.preventContextMenu);
        document.addEventListener("pointerlockchange", this.handlePointerLockChange);
    }

    /** The canvas that is put in pointer lock when it's clicked. */
    public attach(element: HTMLElement): void {
        this._target = element;
        element.addEventListener("click", this.requestPointerLock);
    }

    // ---- Queries -------------------------------------------------------------------------

    public isKeyDown(code: string): boolean {
        return this._pressed.has(code);
    }

    public get mouseDown(): boolean {
        return this._mouseDown;
    }

    /** Whether the mouse is captured. Looking around and shooting only work while it is. */
    public get pointerLocked(): boolean {
        return !!this._target && document.pointerLockElement === this._target;
    }

    /**
     * Mouse movement (in pixels) since this was last called, and resets it. Call it exactly once
     * per frame, from whatever is steering the view.
     */
    public consumeMouseDelta(target = new Vector2()): Vector2 {
        target.copy(this._mouseDelta);
        this._mouseDelta.set(0, 0);
        return target;
    }

    // ---- Subscriptions -------------------------------------------------------------------

    public onKeyDown(code: string, listener: Listener): Unsubscribe {
        return InputManager.subscribe(InputManager.listenersFor(this._keyDownListeners, code), listener);
    }

    public onKeyUp(code: string, listener: Listener): Unsubscribe {
        return InputManager.subscribe(InputManager.listenersFor(this._keyUpListeners, code), listener);
    }

    public onMouseDown(listener: Listener): Unsubscribe {
        return InputManager.subscribe(this._mouseDownListeners, listener);
    }

    public onMouseUp(listener: Listener): Unsubscribe {
        return InputManager.subscribe(this._mouseUpListeners, listener);
    }

    public onWheel(listener: WheelListener): Unsubscribe {
        return InputManager.subscribe(this._wheelListeners, listener);
    }

    /** Fires whenever the mouse is captured or released. */
    public onPointerLockChange(listener: Listener): Unsubscribe {
        return InputManager.subscribe(this._pointerLockListeners, listener);
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
        document.removeEventListener("pointerlockchange", this.handlePointerLockChange);
        this._target?.removeEventListener("click", this.requestPointerLock);
    }

    // ---- DOM handlers --------------------------------------------------------------------

    private requestPointerLock = () => {
        if (!this.pointerLocked) void this._target?.requestPointerLock();
    };

    private handlePointerLockChange = () => {
        this._mouseDelta.set(0, 0);
        if (!this.pointerLocked) {
            // Keys released while the cursor was free never reach us
            this._pressed.clear();
            this._mouseDown = false;
        }
        InputManager.emit(this._pointerLockListeners);
    };

    private handleKeyDown = (e: KeyboardEvent) => {
        // Space and the arrow keys would otherwise scroll the page
        if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
        this._pressed.add(e.code);
        // Ignore auto-repeat so toggles don't flicker when a key is held.
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
        if (e.button !== 0) return;
        this._mouseDown = true;
        InputManager.emit(this._mouseDownListeners);
    };

    private handleMouseUp = (e: MouseEvent) => {
        if (e.button !== 0) return;
        this._mouseDown = false;
        InputManager.emit(this._mouseUpListeners);
    };

    private handleMouseMove = (e: MouseEvent) => {
        if (!this.pointerLocked) return;
        this._mouseDelta.x += e.movementX;
        this._mouseDelta.y += e.movementY;
    };

    private handleWheel = (e: WheelEvent) => {
        for (const listener of [...this._wheelListeners]) listener(e.deltaY);
    };

    private preventContextMenu = (e: Event) => e.preventDefault();

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
