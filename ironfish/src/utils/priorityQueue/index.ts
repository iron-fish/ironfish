/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * PriorityQueue keeps track of two data structures: a binary heap (_items) and a map
 * of objects to their position in the heap (_positions). This map allows for `log(n)`
 * removal from the heap instead of doing a linear scan of the heap to remove an item
 */
export class PriorityQueue<T> {
  private _items: T[] = []
  private _positions: { [key: string]: number } = {}
  readonly compare: (a: T, b: T) => boolean
  readonly hash: (item: T) => string

  /**
   * This data structure is a **Priority Queue** as well as a **Set**. Duplicate entries are
   * not allowed. Entries are identified based on the hash function provided
   *
   * @param compare should return true if a is higher priority than b, otherwise false
   * @param hash should return a unique hash of the item as a string. It should and should
   * be a pure function and very fast (ideally just a field access) because it is called often
   */
  constructor(compare: (a: T, b: T) => boolean, hash: (item: T) => string) {
    this.compare = compare
    this.hash = hash
  }

  /**
   * Adds @param item to the queue and returns true.
   * If `hash(item)` already exists in the queue, returns false
   */
  add(item: T): boolean {
    if (this.has(this.hash(item))) {
      return false
    }

    this._items.push(item)
    this._positions[this.hash(item)] = this._items.length - 1
    this._percolateUp(this._items.length - 1)
    return true
  }

  /**
   * Returns the highest priority element in the queue. If the queue is empty, returns `undefined`
   */
  poll(): T | undefined {
    return this._remove(0)
  }

  /**
   * Removes the element matching the given @param hash. If no element matches, returns `undefined`
   */
  remove(hash: string): T | undefined {
    const index = this._positions[hash]
    if (index === undefined) {
      return undefined
    }

    return this._remove(index)
  }

  /**
   * Look at the highest priority item in the queue without removing it
   */
  peek(): T | undefined {
    return this._items[0]
  }

  /**
   * returns true if the element matching @param hash exists in the queue
   */
  has(hash: string): boolean {
    return this._positions[hash] !== undefined
  }

  /**
   * return the number of elements in the queue
   */
  size(): number {
    return this._items.length
  }

  /**
   * create a new queue copy identical to this queue
   */
  clone(): PriorityQueue<T> {
    const queue = new PriorityQueue<T>(this.compare, this.hash)
    queue._items = this._items.slice(0)
    Object.assign(queue._positions, this._positions)
    return queue
  }

  /**
   * Removes a node at the specified @param index and returns it. Does this by switching
   * the node with the last item in the heap and then popping it off
   */
  private _remove(index: number): T | undefined {
    if (this._items.length === 0) {
      return undefined
    }

    this._swap(index, this._items.length - 1)

    const toReturn = this._items.pop()

    if (toReturn !== undefined) {
      delete this._positions[this.hash(toReturn)]
    }
    // If the index was the last element don't try to percolate, just return it
    if (index === this._items.length) {
      return toReturn
    }

    // Try percolating up first. If the node can't go up any further
    // then this will be a no-op and then try to percolate down. After both operations
    // the node will end up in the correct position
    this._percolateUp(index)
    this._percolateDown(index)

    return toReturn
  }

  /**
   * Attempts to move a node (at @param index) up the heap until it is
   * less or equal to it parent and greater than or equal to its siblings
   */
  private _percolateUp(index: number): void {
    let currIndex = index
    let parentIndex = this._parentIndex(currIndex)

    while (parentIndex >= 0 && this.compare(this._items[currIndex], this._items[parentIndex])) {
      this._swap(currIndex, parentIndex)
      currIndex = parentIndex
      parentIndex = this._parentIndex(currIndex)
    }
  }

  /**
   * Attempts to move a node (at @param index) down the heap until it is
   * less or equal to it parent and greater than or equal to its siblings
   */
  private _percolateDown(index: number): void {
    let currIndex = index
    let smallestChildIndex = this._smallestChildIndex(currIndex)

    while (
      smallestChildIndex !== undefined &&
      this.compare(this._items[smallestChildIndex], this._items[currIndex])
    ) {
      this._swap(currIndex, smallestChildIndex)
      currIndex = smallestChildIndex
      smallestChildIndex = this._smallestChildIndex(currIndex)
    }
  }

  /**
   * Returns the index of the smaller child node. If the given index has
   * no children then returns `undefined`
   */
  private _smallestChildIndex(index: number): number | undefined {
    const leftChildIndex = this._leftChildIndex(index)
    const rightChildIndex = this._rightChildIndex(index)
    if (this._leftChildIndex(index) >= this._items.length) {
      return undefined
    }

    if (
      rightChildIndex >= this._items.length ||
      this.compare(this._items[leftChildIndex], this._items[rightChildIndex])
    ) {
      return leftChildIndex
    }

    return rightChildIndex
  }

  /**
   * Swaps the positions of nodes at @param indexA and @param indexB
   * and updates the map of their positions
   */
  private _swap(indexA: number, indexB: number): void {
    if (indexA === indexB) {
      return
    }

    const itemA = this._items[indexA]
    this._items[indexA] = this._items[indexB]
    this._items[indexB] = itemA

    // TODO: if the hash function is slow at all this could greatly affect performance
    // since _swap is called multiple times for almost every operation
    this._positions[this.hash(this._items[indexA])] = indexA
    this._positions[this.hash(this._items[indexB])] = indexB
  }

  private _parentIndex(index: number): number {
    return Math.floor((index - 1) / 2)
  }

  private _leftChildIndex(index: number): number {
    return 2 * index + 1
  }

  private _rightChildIndex(index: number): number {
    return 2 * index + 2
  }

  /**
   * Make a copy of the queue and generate the items in priority order
   */
  *sorted(): Generator<T, void> {
    const clone = this.clone()

    let item = clone.poll()
    while (item !== undefined) {
      yield item
      item = clone.poll()
    }
  }

  print(index: number, toString: (item: T) => string): string {
    if (index >= this.size()) {
      return ''
    }
    const level = Math.floor(Math.log2(index + 1))
    const indent = '  '.repeat(level) + '*'

    return (
      indent +
      toString(this._items[index]) +
      '\n' +
      this.print(this._leftChildIndex(index), toString) +
      this.print(this._rightChildIndex(index), toString)
    )
  }
}
