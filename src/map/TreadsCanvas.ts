import Entity from "@/entities/Entity.ts";
import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, Vector3 } from "three";

class TreadsCanvas extends Entity {
    private _canvas: HTMLCanvasElement;
    private _context: CanvasRenderingContext2D;
    private _canvasTexture!: CanvasTexture;
    private readonly _size: number;
    private _scaleFactor: number = 0;

    private _treadsResolution: number = 100;

    constructor(size: number, position: Vector3) {
        super(position);
        this._size = size;

        this._canvas = document.createElement("canvas");
        this._context = this._canvas.getContext("2d")!;
    }

    public async load(): Promise<void> {
        const edge = this._size - 1;

        this._canvas.width = edge * this._treadsResolution;
        this._canvas.height = edge * this._treadsResolution;

        this._scaleFactor = this._canvas.width / edge;

        const geometry = new PlaneGeometry(edge, edge);
        this._canvasTexture = new CanvasTexture(this._canvas);
        const material = new MeshStandardMaterial({
            map: this._canvasTexture,
            transparent: true,
        });

        this.mesh = new Mesh(geometry, material);
        this.mesh.position.set(
            this.position.x,
            this.position.y,
            this.position.z + 0.01
        );
    }

    public drawTreads(position: Vector3, angle: number): void {
        const ctx = this._context;

        const x = (position.x * this._scaleFactor) - (this._treadsResolution / 2);
        const y = (position.y * this._scaleFactor) - (this._canvas.height / this._size / 2);

        const treadWidth = 25;
        const treadHeight = 12.5;
        const cornerRadius = 4;

        ctx.save();
        ctx.translate(x, this._canvas.height - y);
        ctx.rotate(-angle);

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
