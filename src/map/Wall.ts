import { Vector3 } from "three";
import Block, { type PropOptions } from "@/entities/props/Block";

/**
 * A 1x1x1 wooden block. Static by default (the level's walls), but walls can also be dynamic, so
 * they can be pushed around and knocked over.
 */
class Wall extends Block {
    constructor(position: Vector3, options: PropOptions = {}) {
        super(position, options);
    }
}

export default Wall;
