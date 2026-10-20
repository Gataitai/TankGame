/** Minimal DOM overlay for the scene/level title, end-of-level messages and short notifications. */
class Hud {
    private readonly _root = document.createElement("div");
    private readonly _title = document.createElement("div");
    private readonly _message = document.createElement("div");
    private readonly _toast = document.createElement("div");
    private _toastTimer?: number;

    constructor() {
        this._root.className = "hud";
        this._title.className = "hud-level";
        this._message.className = "hud-message";
        this._toast.className = "hud-toast";
        this._root.append(this._title, this._message, this._toast);
        document.body.appendChild(this._root);
    }

    /** Text in the top right corner, e.g. "Level 3". */
    public setTitle(text: string): void {
        this._title.textContent = text;
    }

    public showMessage(text: string): void {
        this._message.textContent = text;
        this._message.classList.add("visible");
    }

    public hideMessage(): void {
        this._message.classList.remove("visible");
    }

    /** Shows a short notification at the bottom of the screen. */
    public flash(text: string, durationMs = 1200): void {
        this._toast.textContent = text;
        this._toast.classList.add("visible");
        window.clearTimeout(this._toastTimer);
        this._toastTimer = window.setTimeout(() => this._toast.classList.remove("visible"), durationMs);
    }
}

export default Hud;
