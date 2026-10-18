/** Binary min-heap of integer items ordered by a numeric priority (used by A*). */
class MinHeap {
    private readonly _items: number[] = [];
    private readonly _priorities: number[] = [];

    public get size(): number {
        return this._items.length;
    }

    public push(item: number, priority: number): void {
        this._items.push(item);
        this._priorities.push(priority);
        this.siftUp(this._items.length - 1);
    }

    /** Removes and returns the item with the lowest priority. */
    public pop(): number {
        const top = this._items[0];
        const lastItem = this._items.pop()!;
        const lastPriority = this._priorities.pop()!;
        if (this._items.length > 0) {
            this._items[0] = lastItem;
            this._priorities[0] = lastPriority;
            this.siftDown(0);
        }
        return top;
    }

    private siftUp(index: number): void {
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (this._priorities[parent] <= this._priorities[index]) break;
            this.swap(index, parent);
            index = parent;
        }
    }

    private siftDown(index: number): void {
        const length = this._items.length;
        for (;;) {
            const left = index * 2 + 1;
            const right = left + 1;
            let smallest = index;
            if (left < length && this._priorities[left] < this._priorities[smallest]) smallest = left;
            if (right < length && this._priorities[right] < this._priorities[smallest]) smallest = right;
            if (smallest === index) break;
            this.swap(index, smallest);
            index = smallest;
        }
    }

    private swap(a: number, b: number): void {
        [this._items[a], this._items[b]] = [this._items[b], this._items[a]];
        [this._priorities[a], this._priorities[b]] = [this._priorities[b], this._priorities[a]];
    }
}

export default MinHeap;
