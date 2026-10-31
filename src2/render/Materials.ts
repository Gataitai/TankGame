import { MeshStandardMaterial } from "three";

/**
 * The sandbox palette. Everything is white by default; colour means something, so you can read the
 * scene at a glance:
 *
 * - `white`  plain scenery. Static and indestructible.
 * - `blue`   solid structure: ramps and platforms. Only an explosion brings it down.
 * - `red`    fragile. A single bullet breaks it.
 * - `orange` loose. Push it, stack it, knock it over, shoot it apart.
 * - `green`  balls.
 * - `yellow` landmarks. Indestructible, and tall enough to navigate by.
 */
export const Palette = {
    white: 0xeceff1,
    ground: 0xdfe3e6,
    blue: 0x4e8ed9,
    red: 0xdb5b4c,
    orange: 0xe8913c,
    green: 0x5aab61,
    yellow: 0xe6c04a,
} as const;

const surfaces = new Map<number, MeshStandardMaterial>();

/**
 * The shared surface material for a colour. One per colour for the whole scene, so a thousand
 * props cost a handful of GPU resources — never freed, and never owned by an entity.
 */
export function surfaceMaterial(color: number = Palette.white): MeshStandardMaterial {
    let material = surfaces.get(color);
    if (!material) {
        material = new MeshStandardMaterial({ color, roughness: 0.75, metalness: 0 });
        surfaces.set(color, material);
    }
    return material;
}
