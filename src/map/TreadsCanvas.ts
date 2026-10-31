import Entity from "@/entities/Entity";
import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";

/** Largest canvas edge in pixels (bigger canvases use a lot of memory). */
const MAX_CANVAS_SIZE = 4096;

/** Transparent canvas laid over the ground that tanks draw their tread marks onto. */
class TreadsCanvas extends Entity {
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _canvasTexture!: CanvasTexture;
    private readonly _size: number;
    private _scaleFactor: number = 0;

    /** Canvas pixels per tile; lower on big maps so the canvas stays a reasonable size. */
    private _treadsResolution: number = 100;

    constructor(size: number, position: Vector3) {
        super(position);
        this._size = size;

        this._canvas = document.createElement("canvas");
        this._context = this._canvas.getContext("2d")!;
    }

    public async load(): Promise<void> {
        const edge = this._size - 1;
        this._treadsResolution = Math.min(100, Math.floor(MAX_CANVAS_SIZE / edge));

        this._canvas.width = edge * this._treadsResolution;
        this._canvas.height = edge * this._treadsResolution;

        this._scaleFactor = this._canvas.width / edge;

        const geometry = new PlaneGeometry(edge, edge);
        this._canvasTexture = new CanvasTexture(this._canvas);
        const material = new MeshStandardMaterial({
            map: this._canvasTexture,
            transparent: true,
        });

        this.setMesh(new Mesh(geometry, material));
        this.mesh.position.z += 0.01; // Just above the ground to avoid z-fighting
        this.mesh.receiveShadow = true;
    }

    public drawTreads(position: Vector3, angle: number): void {
        const ctx = this._context;

        // The canvas covers the map from tile 0.5 to size - 0.5 (canvas Y points down)
        const x = (position.x - 0.5) * this._scaleFactor;
        const y = (position.y - 0.5) * this._scaleFactor;

        const treadWidth = 25;
        const treadHeight = 10;
        const cornerRadius = 4;

        ctx.save();
        ctx.translate(x, this._canvas.height - y);
        ctx.rotate(-angle);
        ctx.scale(this._treadsResolution / 100, this._treadsResolution / 100); // Sizes below are for 100 px per tile

        // Subtle shadow for diffusion
        ctx.shadowColor = "rgba(80, 60, 40, 0.3)";  // Softer shadow
        ctx.shadowBlur = 60;  // Less intense diffusion

        // Lower overall opacity for translucent treads
        ctx.globalAlpha = 0.5;

        ctx.fillStyle = "rgba(80, 60, 40, 1)";

        this.fillRoundedRect(ctx, -treadWidth * 1.5, -treadHeight / 2, treadWidth, treadHeight, cornerRadius);
        this.fillRoundedRect(ctx, treadWidth * 0.5, -treadHeight / 2, treadWidth, treadHeight, cornerRadius);

        ctx.restore();

        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;

        this._canvasTexture.needsUpdate = true;
    }

    private fillRoundedRect(
        ctx: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ): void {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
    }
}

export default TreadsCanvas;
