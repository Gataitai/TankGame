import { Light } from "three";
import { defineComponent, type Tag } from "@2/ecs/Ecs";
import type ViewModel from "@2/weapons/ViewModel";
import type WeaponStrategy from "@2/weapons/WeaponStrategy";

/**
 * Can be broken into pieces made from its own mesh (see BreakSystem).
 *
 * Only whole props have this. The pieces they leave behind do not, so a thing comes apart exactly
 * once: shooting the rubble shoves it around rather than splitting it further.
 */
export type Breakable = {
    /** A single bullet is enough. Otherwise it takes an explosion. */
    fragile: boolean;
    /** How many pieces it comes apart into. */
    pieces: number;
};

export const Breakable = defineComponent<Breakable>("breakable");

/** A piece of something that was broken. Tagged so DebrisSystem can cap how many exist at once. */
export const Debris = defineComponent<Tag>("debris");

/** Survives a stage rebuild: the lights, and the player. */
export const Persistent = defineComponent<Tag>("persistent");

/** A light that lives in the world like anything else, so it is placed and freed the same way. */
export type LightSource = {
    light: Light;
};

export const LightSource = defineComponent<LightSource>("lightSource");

/**
 * The player: where it is looking, and what it is holding. Weapons are interchangeable strategies
 * (see weapons/WeaponStrategy); the view model shows the one that's out.
 */
export type PlayerControl = {
    /** Turn around +Z, starting at +X. */
    yaw: number;
    /** Tilt up towards +Z. */
    pitch: number;
    weapons: WeaponStrategy[];
    weaponIndex: number;
    viewModel: ViewModel;
    /** Whether the mouse was already down last frame, so single-shot weapons need a fresh click. */
    triggerHeld: boolean;
};

export const PlayerControl = defineComponent<PlayerControl>("playerControl");
