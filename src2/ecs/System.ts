/**
 * A step of the frame. World runs the systems in a fixed order, once each per frame; see
 * World.buildPipeline() for that order and why it is the way it is.
 */
interface System {
    /** Shown in the debug readout. */
    readonly name: string;

    update(deltaT: number): void;

    /** Throws away anything the system was holding on to. Called when a stage is rebuilt. */
    reset?(): void;
}

export default System;
