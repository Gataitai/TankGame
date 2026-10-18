import {
    BufferGeometry,
    CircleGeometry,
    Color,
    ConeGeometry,
    Group,
    Line,
    LineBasicMaterial,
    Mesh,
    MeshBasicMaterial,
    Scene,
    Vector3,
} from "three";
import Entity from "@/entities/Entity";
import TacticalEnemyTank, { TacticalState } from "@/entities/tanks/TacticalEnemyTank";

const STATE_COLORS: Record<TacticalState, number> = {
    [TacticalState.Patrolling]: 0x4caf50,
    [TacticalState.Chasing]: 0xffb300,
    [TacticalState.Attacking]: 0xff3d3d,
};

/** Height of the planned-path lines. */
const PATH_HEIGHT = 0.6;
/** Waypoint dots lie on the ground, just above the death marks (0.05) so they don't z-fight. */
const WAYPOINT_HEIGHT = 0.06;
/** The marker cone floats this high above its tank, pointing down at it. */
const MARKER_HEIGHT = 1.6;

type TankDebugStyle = { color: Color; material: MeshBasicMaterial };

/**
 * Debug overlay (toggle with "2"). Every tactical enemy gets its own random colour, shown as a
 * cone above the tank and as dots on its patrol waypoints. Each tank's current A* path is drawn
 * as a line coloured by state (green = patrolling, yellow = chasing, red = attacking).
 */
class AiDebugView {
    private readonly _group = new Group();
    private readonly _pathMaterials = new Map<TacticalState, LineBasicMaterial>();
    private readonly _styles = new Map<TacticalEnemyTank, TankDebugStyle>();
    private readonly _waypointGeometry = new CircleGeometry(0.15, 16);
    private readonly _markerGeometry = new ConeGeometry(0.25, 0.5, 16).rotateX(-Math.PI / 2); // Tip points down (-Z)
    private _enabled = false;
    /** Random start, then each new tank steps round the colour wheel so colours stay distinct. */
    private _nextHue = Math.random();

    constructor(scene: Scene) {
        this._group.visible = false;
        scene.add(this._group);
    }

    public toggle(): boolean {
        this._enabled = !this._enabled;
        this._group.visible = this._enabled;
        if (!this._enabled) this.clear();
        return this._enabled;
    }

    public update(entities: readonly Entity[]): void {
        if (!this._enabled) return;
        this.clear();
        this.forgetDeadTanks();

        for (const entity of entities) {
            if (!(entity instanceof TacticalEnemyTank) || entity.shouldDispose) continue;
            const { material } = this.styleFor(entity);

            const marker = new Mesh(this._markerGeometry, material);
            marker.position.set(entity.position.x, entity.position.y, MARKER_HEIGHT);
            this._group.add(marker);

            for (const waypoint of entity.patrolRoute) {
                const dot = new Mesh(this._waypointGeometry, material);
                dot.position.set(waypoint.x, waypoint.y, WAYPOINT_HEIGHT);
                this._group.add(dot);
            }

            if (entity.path.length > 0) {
                const points = [entity.position, ...entity.path].map((p) => new Vector3(p.x, p.y, PATH_HEIGHT));
                this._group.add(new Line(new BufferGeometry().setFromPoints(points), this.pathMaterialFor(entity.state)));
            }
        }
    }

    /** Each tank keeps the same random colour for as long as it lives. */
    private styleFor(tank: TacticalEnemyTank): TankDebugStyle {
        let style = this._styles.get(tank);
        if (!style) {
            const color = new Color().setHSL(this._nextHue, 0.85, 0.55);
            this._nextHue = (this._nextHue + 0.618034) % 1; // Golden ratio: well-spread hues
            // Solid (depth-writing) so transparent treads and death marks can't draw over it
            style = { color, material: new MeshBasicMaterial({ color }) };
            this._styles.set(tank, style);
        }
        return style;
    }

    private forgetDeadTanks(): void {
        for (const [tank, style] of this._styles) {
            if (tank.shouldDispose) {
                style.material.dispose();
                this._styles.delete(tank);
            }
        }
    }

    private pathMaterialFor(state: TacticalState): LineBasicMaterial {
        let material = this._pathMaterials.get(state);
        if (!material) {
            material = new LineBasicMaterial({ color: STATE_COLORS[state] });
            this._pathMaterials.set(state, material);
        }
        return material;
    }

    private clear(): void {
        for (const child of [...this._group.children]) {
            // Path lines get a new geometry every frame; dots and cones share theirs
            if (child instanceof Line) child.geometry.dispose();
            this._group.remove(child);
        }
    }
}

export default AiDebugView;
