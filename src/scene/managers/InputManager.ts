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
