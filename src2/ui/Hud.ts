/**
 * Minimal DOM overlay: the crosshair, the stage title, the weapon you're holding, short
 * notifications and the "click to look around" prompt shown while the mouse isn't captured.
 */
class Hud {
    private readonly _root = document.createElement("div");
    private readonly _crosshair = document.createElement("div");
    private readonly _title = document.createElement("div");
    private readonly _weapon = document.createElement("div");
    private readonly _hint = document.createElement("div");
    private readonly _toast = document.createElement("div");
    private _toastTimer?: number;

    constructor() {
        this._root.className = "hud";
        this._crosshair.className = "hud-crosshair";
        this._title.className = "hud-title";
        this._weapon.className = "hud-weapon";
        this._hint.className = "hud-hint";
        this._toast.className = "hud-toast";
        this._hint.textContent = "Click to look around — WASD move · Shift run · Space jump · "
            + "Mouse shoot · 1/2 or scroll switch weapon · R reset";
        this._root.append(this._crosshair, this._title, this._weapon, this._hint, this._toast);
        document.body.appendChild(this._root);
    }

    /** Text in the top right corner, e.g. the stage's name. */
    public setTitle(text: string): void {
        if (this._title.textContent !== text) this._title.textContent = text;
    }

    /** The weapon currently in hand, shown in the bottom right corner. */
    public setWeapon(text: string): void {
        if (this._weapon.textContent !== text) this._weapon.textContent = text;
    }

    /** Shows the controls (and hides the crosshair) while the mouse isn't captured. */
    public setPlaying(playing: boolean): void {
        this._root.classList.toggle("playing", playing);
    }

    /** Shows a short notification in the middle of the screen. */
    public flash(text: string, durationMs = 1000): void {
        this._toast.textContent = text;
        this._toast.classList.add("visible");
        window.clearTimeout(this._toastTimer);
        this._toastTimer = window.setTimeout(() => this._toast.classList.remove("visible"), durationMs);
    }
}

export default Hud;
