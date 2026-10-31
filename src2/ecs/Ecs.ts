/**
 * A very small entity-component-system.
 *
 * An entity is just a number. Everything about it lives in components: plain data kept in a store
 * per component type, keyed by entity id. Nothing has behaviour of its own — systems walk the
 * stores once per frame and do the work (see the systems folder).
 *
 * A component type is only a typed key. The data itself belongs to the Ecs instance, so a world
 * really owns everything in it and clear() leaves nothing behind.
 *
 * Two rules make this safe to use from inside a system:
 * - destroy() only marks an entity; it is really removed by flush() at the end of the frame, so
 *   iterating a store while destroying entities is fine.
 * - onRemove on a component type frees whatever the value owns (a geometry, a physics body), so
 *   cleanup can't be forgotten at the call site.
 */

export type EntityId = number;

/** A component that carries no data: its presence on an entity is the whole message. */
export type Tag = true;

let nextComponentId = 0;

/**
 * A kind of data entities can have. This is just the key — look the values up through an Ecs.
 */
export class Component<T> {
    /** Index of this type's store inside each Ecs. */
    public readonly id: number;

    /** Frees whatever the value owns when the component goes away. Set once, at startup. */
    public onRemove?: (value: T, entity: EntityId) => void;

    constructor(public readonly name: string) {
        this.id = nextComponentId++;
    }
}

/** A component of any shape, for the calls that only care whether an entity has one. */
export type AnyComponent = Component<any>;

/**
 * Every declared component type, by id. Destroying an entity has to clear its data out of each
 * store, and this is how it finds the matching cleanup handler for each one.
 */
const componentsById: AnyComponent[] = [];

/** Declares a kind of data entities can have. Every component type is made with this. */
export function defineComponent<T>(name: string): Component<T> {
    const component = new Component<T>(name);
    componentsById[component.id] = component;
    return component;
}

type Store = Map<EntityId, any>;

class Ecs {
    private _nextId: EntityId = 1;
    private readonly _alive = new Set<EntityId>();
    private readonly _doomed = new Set<EntityId>();
    /** One store per component type, indexed by Component.id and filled in as types are used. */
    private readonly _stores: (Store | undefined)[] = [];

    public create(): EntityId {
        const entity = this._nextId++;
        this._alive.add(entity);
        return entity;
    }

    public isAlive(entity: EntityId): boolean {
        return this._alive.has(entity);
    }

    /** Whether the entity is already on its way out (destroy() was called this frame). */
    public isDoomed(entity: EntityId): boolean {
        return this._doomed.has(entity);
    }

    public get population(): number {
        return this._alive.size;
    }

    // ---- Components ----------------------------------------------------------------------

    public add<T>(entity: EntityId, component: Component<T>, value: T): T {
        this.store(component).set(entity, value);
        return value;
    }

    public get<T>(entity: EntityId, component: Component<T>): T | undefined {
        return this._stores[component.id]?.get(entity);
    }

    /** Like get(), for when the component must be there. Throws instead of returning undefined. */
    public require<T>(entity: EntityId, component: Component<T>): T {
        const value = this.get(entity, component);
        if (value === undefined) throw new Error(`Entity ${entity} has no ${component.name}`);
        return value;
    }

    public has(entity: EntityId, component: AnyComponent): boolean {
        return this._stores[component.id]?.has(entity) ?? false;
    }

    /** How many entities have this component. */
    public count(component: AnyComponent): number {
        return this._stores[component.id]?.size ?? 0;
    }

    /** Drops a component and runs its cleanup. */
    public remove<T>(entity: EntityId, component: Component<T>): void {
        const store = this._stores[component.id];
        if (!store) return;
        const value = store.get(entity);
        if (value === undefined) return;
        store.delete(entity);
        component.onRemove?.(value, entity);
    }

    /**
     * Drops a component and hands the value back *without* running its cleanup: whatever it owns
     * now belongs to the caller. This is how a destroyed object's mesh survives long enough to be
     * cut into pieces (see BreakSystem).
     */
    public take<T>(entity: EntityId, component: Component<T>): T | undefined {
        const store = this._stores[component.id];
        if (!store) return undefined;
        const value = store.get(entity);
        store.delete(entity);
        return value;
    }

    // ---- Lifetime ------------------------------------------------------------------------

    /** Marks the entity for removal at the end of the frame. Safe to call more than once. */
    public destroy(entity: EntityId): void {
        if (this._alive.has(entity)) this._doomed.add(entity);
    }

    /** Really removes everything marked by destroy(). Called once per frame by World. */
    public flush(): number {
        if (this._doomed.size === 0) return 0;

        const doomed = [...this._doomed];
        this._doomed.clear();
        for (const entity of doomed) {
            this.strip(entity);
            this._alive.delete(entity);
        }
        return doomed.length;
    }

    /** Removes every entity except the ones `keep` approves of. Used when rebuilding a stage. */
    public clear(keep?: (entity: EntityId) => boolean): void {
        for (const entity of this._alive) {
            if (!keep?.(entity)) this._doomed.add(entity);
        }
        this.flush();
    }

    // ---- Queries -------------------------------------------------------------------------

    /**
     * Walks every entity that has `component`, with its value. The fast path systems use.
     * Destroying entities inside the callback is fine (it only marks them); adding or removing
     * this very component is not.
     */
    public each<T>(component: Component<T>, visit: (entity: EntityId, value: T) => void): void {
        const store = this._stores[component.id];
        if (!store) return;
        for (const [entity, value] of store) visit(entity, value);
    }

    /**
     * The entities that have all of `components`, as a fresh array. Walks the smallest store and
     * checks the rest. The array is a snapshot, so the world may be changed while looping over it.
     */
    public query(...components: AnyComponent[]): EntityId[] {
        if (components.length === 0) return [];

        let smallest: Store | undefined = this._stores[components[0].id];
        for (const component of components) {
            const store = this._stores[component.id];
            if (!store) return [];
            if (!smallest || store.size < smallest.size) smallest = store;
        }
        if (!smallest) return [];

        const found: EntityId[] = [];
        for (const entity of smallest.keys()) {
            let matches = true;
            for (const component of components) {
                const store = this._stores[component.id]!;
                if (store !== smallest && !store.has(entity)) {
                    matches = false;
                    break;
                }
            }
            if (matches) found.push(entity);
        }
        return found;
    }

    // ---- Internals -----------------------------------------------------------------------

    private store<T>(component: Component<T>): Store {
        let store = this._stores[component.id];
        if (!store) {
            store = new Map<EntityId, any>();
            this._stores[component.id] = store;
        }
        return store;
    }

    /** Removes every component an entity has, running each one's cleanup. */
    private strip(entity: EntityId): void {
        for (const component of componentsById) {
            const store = this._stores[component.id];
            if (!store) continue;
            const value = store.get(entity);
            if (value === undefined) continue;
            store.delete(entity);
            component.onRemove?.(value, entity);
        }
    }
}

export default Ecs;
