/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import LRU from 'blru'
import { Assert } from '../assert'
import { JsonSerializable } from '../serde'
import {
  DatabaseKey,
  IDatabase,
  IDatabaseEncoding,
  IDatabaseStore,
  IDatabaseTransaction,
  LevelupTransaction,
  SchemaValue,
  StringEncoding,
  U32_ENCODING,
} from '../storage'
import { MerkleHasher } from './hasher'
import {
  CounterSchema,
  LeavesIndexSchema,
  LeavesSchema,
  NodesSchema,
  NodeValue,
} from './schema'
import { depthAtLeafCount, isEmpty, isRight } from './utils'
import { Witness, WitnessNode } from './witness'

export class MerkleTree<
  E,
  H extends DatabaseKey,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
> {
  readonly hasher: MerkleHasher<E, H, SE, SH>
  readonly db: IDatabase
  readonly name: string = ''
  readonly depth: number = 32
  readonly defaultValue: H

  readonly counter: IDatabaseStore<CounterSchema>
  readonly leaves: IDatabaseStore<LeavesSchema<H>>
  readonly leavesIndex: IDatabaseStore<LeavesIndexSchema<H>>
  readonly nodes: IDatabaseStore<NodesSchema<H>>

  private readonly pastRootCache: LRU<number, H> = new LRU<number, H>(300 * 60)
  private readonly transactionPastRootCache: LRU<number, Map<number, H>> = new LRU<
    number,
    Map<number, H>
  >(5)

  constructor({
    hasher,
    db,
    leafEncoding,
    leafIndexKeyEncoding,
    nodeEncoding,
    defaultValue,
    name = '',
    depth = 32,
  }: {
    hasher: MerkleHasher<E, H, SE, SH>
    db: IDatabase
    leafEncoding: IDatabaseEncoding<LeavesSchema<H>['value']>
    leafIndexKeyEncoding: IDatabaseEncoding<LeavesIndexSchema<H>['key']>
    nodeEncoding: IDatabaseEncoding<NodesSchema<H>['value']>
    defaultValue: H
    name?: string
    depth?: number
  }) {
    this.hasher = hasher
    this.db = db
    this.name = name
    this.depth = depth
    this.defaultValue = defaultValue

    this.counter = db.addStore({
      name: `${name}c`,
      keyEncoding: new StringEncoding<'Leaves' | 'Nodes'>(),
      valueEncoding: U32_ENCODING,
    })

    this.leaves = db.addStore({
      name: `${name}l`,
      keyEncoding: U32_ENCODING,
      valueEncoding: leafEncoding,
    })

    this.leavesIndex = db.addStore({
      name: `${name}i`,
      keyEncoding: leafIndexKeyEncoding,
      valueEncoding: U32_ENCODING,
    })

    this.nodes = db.addStore({
      name: `${name}n`,
      keyEncoding: U32_ENCODING,
      valueEncoding: nodeEncoding,
    })
  }

  /**
   * Get the number of leaf nodes (elements) in the tree.
   */
  async size(tx?: IDatabaseTransaction): Promise<number> {
    return await this.db.withTransaction(tx, async (tx) => {
      return await this.getCount('Leaves', tx)
    })
  }

  /**
   * Get the leaf element at the given index. Throws an error if the
   * index is not in bounds.
   */
  async getLeaf(
    index: LeafIndex,
    tx?: IDatabaseTransaction,
  ): Promise<SchemaValue<LeavesSchema<H>>> {
    const leaf = await this.getLeafOrNull(index, tx)
    if (!leaf) {
      throw new Error(`No leaf found in tree ${this.name} at index ${index}`)
    }
    return leaf
  }

  /**
   * Get the leaf element at the given index. Returns null if the
   * index is not in bounds.
   */
  async getLeafOrNull(
    index: LeafIndex,
    tx?: IDatabaseTransaction,
  ): Promise<SchemaValue<LeavesSchema<H>> | null> {
    return await this.db.withTransaction(tx, async (tx) => {
      const leaf = await this.leaves.get(index, tx)
      return leaf || null
    })
  }

  /**
   * Get the node element at the given index. Throws an error if the
   * index is not in bounds.
   */
  async getNode(
    index: NodeIndex,
    tx?: IDatabaseTransaction,
  ): Promise<SchemaValue<NodesSchema<H>>> {
    const node = await this.getNodeOrNull(index, tx)
    if (!node) {
      throw new Error(`No node found in tree ${this.name} at index ${index}`)
    }
    return node
  }

  /**
   * Get the node element at the given index. Returns null if the
   * index is not in bounds.
   */
  async getNodeOrNull(
    index: NodeIndex,
    tx?: IDatabaseTransaction,
  ): Promise<SchemaValue<NodesSchema<H>> | null> {
    const node = await this.nodes.get(index, tx)
    return node || null
  }

  /**
   * Get the count of a given tree. Throws an error if the
   * count is not in the store.
   */
  async getCount(countType: 'Leaves' | 'Nodes', tx?: IDatabaseTransaction): Promise<LeafIndex> {
    let count = await this.counter.get(countType, tx)

    if (count === undefined) {
      if (countType === 'Leaves') {
        count = 0
      } else if (countType === 'Nodes') {
        count = 1
      } else {
        Assert.isNever(countType)
      }

      await this.counter.put(countType, count, tx)
    }

    return count
  }

  /**
   * Add the new leaf element into the tree, and update all hashes.
   */
  async add(element: E, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      const startingLeafIndex = await this.size(tx)

      await this.addLeafWithNodes(element, tx)

      await this.hashTree(startingLeafIndex, tx)
    })
  }

  /**
   * Add the new leaf element into the tree, creating new nodes if necessary.
   *
   * Requires running hashTree to update the tree's hash values.
   */
  private async addLeafWithNodes(element: E, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      const merkleHash = this.hasher.hash(element)
      const indexOfNewLeaf = await this.getCount('Leaves', tx)

      let newParentIndex: NodeIndex

      if (indexOfNewLeaf === 0) {
        // Special case where this is the first leaf, with no parent
        newParentIndex = 0
      } else if (indexOfNewLeaf === 1) {
        // Special case where this is the second leaf, and both leaves need a new parent
        newParentIndex = 1

        const leftLeafIndex = 0
        const leftLeaf = await this.getLeaf(leftLeafIndex, tx)
        const hashOfSibling = this.defaultValue

        await this.nodes.put(
          newParentIndex,
          {
            side: Side.Left,
            parentIndex: 0,
            hashOfSibling,
          },
          tx,
        )

        await this.addLeaf(
          leftLeafIndex,
          {
            merkleHash: leftLeaf.merkleHash,
            parentIndex: newParentIndex,
          },
          tx,
        )

        await this.counter.put('Nodes', 2, tx)
      } else if (isRight(indexOfNewLeaf)) {
        // Simple case where we are adding a new node to a parent with an empty right child
        const leftLeafIndex = indexOfNewLeaf - 1
        const leaf = await this.getLeaf(leftLeafIndex, tx)
        newParentIndex = leaf.parentIndex
      } else {
        // Walk up the path from the previous leaf until finding an empty or right-hand node
        // Create a bunch of left-hand nodes for each step up that path
        const previousLeafIndex = indexOfNewLeaf - 1
        const previousLeaf = await this.getLeaf(previousLeafIndex, tx)
        let previousParentIndex = previousLeaf.parentIndex

        let nextNodeIndex = await this.getCount('Nodes', tx)
        let shouldContinue = true

        newParentIndex = nextNodeIndex

        while (shouldContinue) {
          const previousParent = await this.getNode(previousParentIndex, tx)

          if (previousParent.side === Side.Left) {
            // found a node we can attach a child too; hook it up to the new chain of left nodes
            const newNode = {
              side: Side.Right,
              leftIndex: previousParentIndex,
              hashOfSibling: previousParent.hashOfSibling,
              index: nextNodeIndex,
            }

            await this.nodes.put(nextNodeIndex, newNode, tx)
            nextNodeIndex += 1

            await this.counter.put('Nodes', nextNodeIndex, tx)

            if (!previousParent.parentIndex || isEmpty(previousParent.parentIndex)) {
              const newParent = {
                side: Side.Left,
                parentIndex: 0,
                hashOfSibling: this.defaultValue,
                index: nextNodeIndex,
              }

              await this.nodes.put(nextNodeIndex, newParent, tx)

              await this.nodes.put(
                previousParentIndex,
                {
                  side: Side.Left,
                  hashOfSibling: previousParent.hashOfSibling,
                  parentIndex: nextNodeIndex,
                },
                tx,
              )

              nextNodeIndex += 1
              await this.counter.put('Nodes', nextNodeIndex, tx)
            }

            shouldContinue = false
          } else {
            // previous parent is a right node, gotta go up a step
            if (previousParent.leftIndex === undefined) {
              throw new Error(`Parent has no left sibling`)
            }

            const leftSibling = await this.getNode(previousParent.leftIndex, tx)

            if (leftSibling.parentIndex === undefined) {
              throw new Error(`Left sibling has no parent`)
            }
            const leftSiblingParentIndex = leftSibling.parentIndex

            const newNode = {
              side: Side.Left,
              parentIndex: nextNodeIndex + 1, // where the next node will be (in the next iteration)
              hashOfSibling: this.defaultValue,
              index: nextNodeIndex,
            }
            await this.nodes.put(nextNodeIndex, newNode, tx)

            nextNodeIndex += 1

            await this.counter.put('Nodes', nextNodeIndex, tx)

            previousParentIndex = leftSiblingParentIndex
          }
        }
      }

      await this.counter.put('Leaves', indexOfNewLeaf + 1, tx)

      await this.addLeaf(
        indexOfNewLeaf,
        {
          merkleHash,
          parentIndex: newParentIndex,
        },
        tx,
      )
    })
  }

  async addBatch(elements: Iterable<E>, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      const startingLeafIndex = await this.size(tx)

      for (const element of elements) {
        await this.addLeafWithNodes(element, tx)
      }

      await this.hashTree(startingLeafIndex, tx)
    })
  }

  private async addLeaf(
    index: LeavesSchema<H>['key'],
    value: LeavesSchema<H>['value'],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.leaves.put(
      index,
      {
        merkleHash: value.merkleHash,
        parentIndex: value.parentIndex,
      },
      tx,
    )

    await this.leavesIndex.put(value.merkleHash, index, tx)
  }

  /**
   * Truncate the tree to the values it contained when it contained pastSize
   * elements.
   *
   * After calling, it will contain at most pastSize elements, but truncating
   * to a size that is higher than this.length is a no-op.
   *
   * This function doesn't do any garbage collection. The old leaves and nodes
   * are still in the database, but they will be overwritten as the new tree
   * grows.
   */
  async truncate(pastSize: number, tx?: IDatabaseTransaction): Promise<void> {
    this.invalidatePastRootCache(pastSize, tx)
    return await this.db.withTransaction(tx, async (tx) => {
      const oldSize = await this.getCount('Leaves', tx)

      if (pastSize >= oldSize) {
        return
      }

      await this.counter.put('Leaves', pastSize, tx)

      for (let index = oldSize - 1; index >= pastSize; --index) {
        const leaf = await this.getLeaf(index, tx)
        await this.leavesIndex.del(leaf.merkleHash, tx)
      }

      if (pastSize === 0) {
        await this.counter.put('Nodes', 1, tx)
        return
      }

      if (pastSize === 1) {
        await this.counter.put('Nodes', 1, tx)

        const index = 0
        const firstLeaf = await this.getLeaf(index, tx)
        firstLeaf.parentIndex = 0
        await this.addLeaf(index, firstLeaf, tx)
        return
      }

      const depth = depthAtLeafCount(pastSize) - 2
      const leaf = await this.getLeaf(pastSize - 1, tx)
      let parentIndex = leaf.parentIndex
      let maxParentIndex = parentIndex

      for (let i = 0; i < depth; i++) {
        let parent = await this.getNode(parentIndex, tx)

        if (parent.side === Side.Right) {
          Assert.isNotUndefined(parent.leftIndex)
          parent = await this.getNode(parent.leftIndex, tx)
        }

        Assert.isNotUndefined(parent.parentIndex)
        parentIndex = parent.parentIndex

        if (parent.parentIndex > maxParentIndex) {
          maxParentIndex = parent.parentIndex
        }
      }

      const parent = await this.getNode(parentIndex, tx)

      if (parent.side === Side.Right) {
        // Indicates error in this method's code
        throw new Error('Expected new root node to be a left node')
      }

      parent.parentIndex = 0
      await this.nodes.put(parentIndex, parent, tx)
      await this.counter.put('Nodes', maxParentIndex + 1, tx)
      await this.hashTree(pastSize - 1, tx)
    })
  }

  // Invalidate and pastSize entries greater than maxSize
  private invalidatePastRootCache(maxSize: number, tx?: IDatabaseTransaction): void {
    if (tx instanceof LevelupTransaction) {
      const local = this.transactionPastRootCache.get(tx.id)
      for (const pastSize of local?.keys() || []) {
        if (pastSize > maxSize) {
          local?.delete(pastSize)
        }
      }
    }

    for (const pastSize of this.pastRootCache.keys()) {
      if (pastSize > maxSize) {
        this.pastRootCache.remove(pastSize)
      }
    }
  }

  private setPastRootCache(pastSize: number, hash: H, tx: IDatabaseTransaction): void {
    if (tx instanceof LevelupTransaction) {
      const cache = this.transactionPastRootCache.get(tx.id) || new Map<number, H>()
      cache.set(pastSize, hash)
      this.transactionPastRootCache.set(tx.id, cache)
    }
  }

  private getPastRootCache(pastSize: number, tx?: IDatabaseTransaction): H | null {
    if (tx instanceof LevelupTransaction) {
      const local = this.transactionPastRootCache.get(tx.id)
      const localResult = local && local.get(pastSize)

      return localResult || this.pastRootCache.get(pastSize)
    }

    return this.pastRootCache.get(pastSize)
  }

  pastRootTxCommitted(tx: IDatabaseTransaction): void {
    if (tx instanceof LevelupTransaction) {
      const local = this.transactionPastRootCache.get(tx.id)
      for (const [pastSize, hash] of local?.entries() || []) {
        this.pastRootCache.set(pastSize, hash)
      }
      this.transactionPastRootCache.remove(tx.id)
    }
  }

  /**
   * Calculate what the root hash was at the time the tree contained
   * `pastSize` elements. Throws an error if the tree is empty,
   * the request size is greater than the size of the tree, or the requested
   * size is 0
   */
  async pastRoot(pastSize: number, tx?: IDatabaseTransaction): Promise<H> {
    return this.db.withTransaction(tx, async (tx) => {
      const leafCount = await this.getCount('Leaves', tx)

      if (leafCount === 0 || pastSize > leafCount || pastSize === 0) {
        throw new Error(`Unable to get past size ${pastSize} for tree with ${leafCount} nodes`)
      }

      const cached = this.getPastRootCache(pastSize, tx)
      if (cached) {
        return Promise.resolve(cached)
      }

      const rootDepth = depthAtLeafCount(pastSize)
      const minTreeDepth = Math.min(rootDepth, this.depth)
      const leafIndex = pastSize - 1
      const leaf = await this.getLeaf(leafIndex, tx)

      let currentHash = leaf.merkleHash
      let currentNodeIndex = leaf.parentIndex

      if (isRight(leafIndex)) {
        const sibling = await this.getLeaf(leafIndex - 1, tx)
        const siblingHash = sibling.merkleHash
        currentHash = this.hasher.combineHash(0, siblingHash, currentHash)
      } else {
        currentHash = this.hasher.combineHash(0, currentHash, currentHash)
      }

      for (let depth = 1; depth < minTreeDepth; depth++) {
        const node = await this.getNode(currentNodeIndex, tx)

        switch (node.side) {
          case Side.Left:
            Assert.isNotUndefined(node.parentIndex)
            currentNodeIndex = node.parentIndex
            currentHash = this.hasher.combineHash(depth, currentHash, currentHash)
            break

          case Side.Right: {
            Assert.isNotUndefined(node.leftIndex)
            const leftNode = await this.getNode(node.leftIndex, tx)
            Assert.isNotUndefined(leftNode.parentIndex)
            currentNodeIndex = leftNode.parentIndex
            currentHash = this.hasher.combineHash(depth, node.hashOfSibling, currentHash)
            break
          }

          default:
            Assert.isUnreachable(node.side)
        }
      }

      for (let depth = rootDepth; depth < this.depth; depth++) {
        currentHash = this.hasher.combineHash(depth, currentHash, currentHash)
      }

      this.setPastRootCache(pastSize, currentHash, tx)
      return currentHash
    })
  }

  /**
   * Calculate what the hash was at the time the tree contained
   * `pastSize` elements for each node index on the right side of the tree.
   */
  async pastRightSiblingHashes(
    pastSize: number,
    tx?: IDatabaseTransaction,
  ): Promise<Map<number, H>> {
    return this.db.withTransaction(tx, async (tx) => {
      const pastHashes: Map<number, H> = new Map<number, H>()

      const leafCount = await this.getCount('Leaves', tx)

      if (leafCount === 0 || pastSize > leafCount || pastSize === 0) {
        throw new Error(
          `Unable to get past sibling hashes at size ${pastSize} for tree with ${leafCount} nodes`,
        )
      }

      const leafIndex = pastSize - 1
      const leaf = await this.getLeaf(leafIndex, tx)

      const rootDepth = depthAtLeafCount(pastSize)
      const minTreeDepth = Math.min(rootDepth, this.depth)

      let currentHash = leaf.merkleHash
      let currentNodeIndex = leaf.parentIndex

      if (isRight(leafIndex)) {
        const sibling = await this.getLeaf(leafIndex - 1, tx)
        const siblingHash = sibling.merkleHash
        currentHash = this.hasher.combineHash(0, siblingHash, currentHash)
      } else {
        currentHash = this.hasher.combineHash(0, currentHash, currentHash)
      }

      pastHashes.set(currentNodeIndex, currentHash)

      for (let depth = 1; depth < minTreeDepth; depth++) {
        const node = await this.getNode(currentNodeIndex, tx)

        switch (node.side) {
          case Side.Left:
            Assert.isNotUndefined(node.parentIndex)
            currentNodeIndex = node.parentIndex
            currentHash = this.hasher.combineHash(depth, currentHash, currentHash)
            pastHashes.set(currentNodeIndex, currentHash)
            break

          case Side.Right: {
            Assert.isNotUndefined(node.leftIndex)
            const leftNode = await this.getNode(node.leftIndex, tx)
            pastHashes.set(node.leftIndex, currentHash)

            Assert.isNotUndefined(leftNode.parentIndex)
            currentNodeIndex = leftNode.parentIndex
            currentHash = this.hasher.combineHash(depth, node.hashOfSibling, currentHash)
            pastHashes.set(leftNode.parentIndex, currentHash)

            break
          }

          default:
            Assert.isUnreachable(node.side)
        }
      }

      return pastHashes
    })
  }

  /**
   * Get the root hash of the tree. Throws an error if the tree is empty.
   */
  async rootHash(tx?: IDatabaseTransaction): Promise<H> {
    const size = await this.size(tx)
    return await this.pastRoot(size, tx)
  }

  /**
   * Check if the tree currently contains the given element.
   */
  async contains(value: E, tx?: IDatabaseTransaction): Promise<boolean> {
    const currSize = await this.size(tx)
    const elementIndex = await this.leavesIndex.get(this.hasher.hash(value), tx)

    return elementIndex !== undefined && elementIndex < currSize
  }

  /**
   * Construct the proof that the leaf node at `position` exists.
   *
   * The length of the returned vector is the depth of the leaf node in the tree
   *
   * The leftmost value in the vector, the hash at index 0, is the hash of the
   * leaf node's sibling. The rightmost value in the vector contains the hash of
   * sibling of the child of the root node.
   *
   * The root hash is not included in the authentication path.
   *
   * returns null if there are no leaves or the position is not in the list.
   */
  async witness(
    index: LeafIndex,
    size?: number,
    tx?: IDatabaseTransaction,
  ): Promise<Witness<E, H, SE, SH> | null> {
    return this.db.withTransaction(tx, async (tx) => {
      const authenticationPath: WitnessNode<H>[] = []

      const currentLeafCount = await this.size(tx)
      if (size && size > currentLeafCount) {
        throw new Error(
          `Unable to get witness at size ${size} for tree with ${currentLeafCount} nodes`,
        )
      }

      const witnessLeafCount = size ? size : currentLeafCount

      if (witnessLeafCount === 0 || index >= witnessLeafCount) {
        return null
      }

      const pastSiblingHashes =
        witnessLeafCount < currentLeafCount
          ? await this.pastRightSiblingHashes(witnessLeafCount, tx)
          : new Map<number, H>()

      const leaf = await this.getLeaf(index, tx)
      let currentHash = leaf.merkleHash
      let currentPosition = leaf.parentIndex as NodeIndex | undefined

      if (isRight(index)) {
        const hashOfSibling = (await this.getLeaf(index - 1, tx)).merkleHash
        authenticationPath.push({ side: Side.Right, hashOfSibling })
        currentHash = this.hasher.combineHash(0, hashOfSibling, currentHash)
      } else if (index < witnessLeafCount - 1) {
        // Left leaf and have a right sibling
        const hashOfSibling = (await this.getLeaf(index + 1, tx)).merkleHash
        authenticationPath.push({ side: Side.Left, hashOfSibling })
        currentHash = this.hasher.combineHash(0, currentHash, hashOfSibling)
      } else {
        // Left leaf and rightmost node
        authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
        currentHash = this.hasher.combineHash(0, currentHash, currentHash)
      }

      const rootDepth = Math.min(depthAtLeafCount(witnessLeafCount), this.depth)

      for (let depth = 1; depth < rootDepth; depth++) {
        const node =
          currentPosition !== undefined ? await this.getNodeOrNull(currentPosition, tx) : null

        if (node === null) {
          authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
          currentHash = this.hasher.combineHash(depth, currentHash, currentHash)
        } else if (node.side === Side.Left) {
          Assert.isNotUndefined(currentPosition)
          // Use the recomputed hash of the right sibling
          const hashOfSibling = pastSiblingHashes.get(currentPosition) ?? node.hashOfSibling

          authenticationPath.push({ side: Side.Left, hashOfSibling: hashOfSibling })
          currentHash = this.hasher.combineHash(depth, currentHash, hashOfSibling)
          currentPosition = node.parentIndex
        } else {
          authenticationPath.push({ side: Side.Right, hashOfSibling: node.hashOfSibling })
          currentHash = this.hasher.combineHash(depth, node.hashOfSibling, currentHash)
          Assert.isNotUndefined(node.leftIndex)
          const leftSibling = await this.getNode(node.leftIndex, tx)
          currentPosition = leftSibling.parentIndex
        }
      }

      for (let depth = rootDepth; depth < this.depth; depth++) {
        authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
        currentHash = this.hasher.combineHash(depth, currentHash, currentHash)
      }

      return new Witness(witnessLeafCount, currentHash, authenticationPath, this.hasher)
    })
  }

  /**
   * Update hashes in the tree for leaves including and after startingLeafIndex.
   */
  private async hashTree(startingLeafIndex: number, tx: IDatabaseTransaction): Promise<void> {
    const leavesCount = await this.getCount('Leaves', tx)

    if (leavesCount <= 1 || startingLeafIndex > leavesCount - 1) {
      return
    }

    const hashStack: {
      hash: H // hash of a subtree
      index: number // root node of the subtree
      depth: number // depth of the root node
      siblingIndex: number | null // index where the hash belongs
    }[] = []

    // Iterate over the leaves from right to left, hashing each leaf with its sibling (if it has one),
    // then fetching the parent node:
    // * If the node is a right node, push the current hash onto the stack.
    // * If the node is a left node, pop a hash off the stack, update the hash of the node and its
    //   siblings, push the hash of the node and sibling onto the stack, then move to the parent node.
    for (
      let leafIndex = leavesCount - 1;
      leafIndex >= startingLeafIndex;
      isRight(leafIndex) ? (leafIndex -= 2) : leafIndex--
    ) {
      // if leafIndex is even, we have a leaf without a sibling on the right of the tree
      let leftLeaf, rightLeaf
      if (isRight(leafIndex)) {
        leftLeaf = await this.getLeaf(leafIndex - 1, tx)
        rightLeaf = await this.getLeaf(leafIndex, tx)
      } else {
        rightLeaf = await this.getLeaf(leafIndex, tx)
        leftLeaf = rightLeaf
      }

      let depth = 0
      let hash = this.hasher.combineHash(depth, leftLeaf.merkleHash, rightLeaf.merkleHash)
      let nodeIndex: number | undefined = leftLeaf.parentIndex
      let node: NodeValue<H> = await this.getNode(nodeIndex, tx)

      while (node.side === Side.Left && node.parentIndex !== 0) {
        const element = hashStack.pop()
        const stackHash = element?.hash ?? hash
        // Should only be undefined if on the right side of the tree
        // Ex: In a tree of 6 leaves, the two rightmost leaves will have
        // a parent node with no sibling node
        if (element === undefined) {
          await this.updateHash(nodeIndex, node, hash, tx)
        } else {
          Assert.isNotNull(element.siblingIndex)
          Assert.isEqual(nodeIndex, element.siblingIndex)

          const leftNode = await this.getNode(element.siblingIndex, tx)
          await this.updateHash(element.siblingIndex, leftNode, element.hash, tx)

          const rightNode = await this.getNode(element.index, tx)
          await this.updateHash(element.index, rightNode, hash, tx)
        }

        depth++

        nodeIndex = node.parentIndex
        Assert.isNotUndefined(nodeIndex)
        node = await this.getNode(nodeIndex, tx)
        hash = this.hasher.combineHash(depth, hash, stackHash)
      }

      // We're now either at a right node, or the root node of the entire tree.
      if (node.parentIndex === 0) {
        await this.updateHash(nodeIndex, node, hash, tx)
      } else {
        Assert.isNotUndefined(node.leftIndex)
        hashStack.push({
          hash,
          depth,
          index: nodeIndex,
          siblingIndex: node.leftIndex,
        })
      }
    }

    // At this point, hashes have been set for complete subtrees of nodes above the leaves. Next, we need
    // to update hashes for nodes that depend on the subtrees. If the root of a subtree is a right node, it
    // will still be in hashStack, so we start at each of these nodes and continue up the tree.
    while (hashStack.length > 0) {
      // We'll hash upward from the smallest subtree. This will be the leftmost subtree, which will be the
      // most recently pushed hash onto the stack.
      const element = hashStack.pop()
      Assert.isNotUndefined(element)

      // If siblingIndex is null, we're at a left node. We'll look through hashStack to see if we've
      // already encountered its sibling, which will happen if its sibling is a right-node root of a
      // complete subtree.
      if (element.siblingIndex === null) {
        for (let i = 0; i < hashStack.length; i++) {
          if (hashStack[i].siblingIndex === element.index) {
            element.siblingIndex = hashStack[i].index
          }
        }
      }

      let siblingNode
      const node = await this.getNode(element.index, tx)

      // If we haven't encountered its sibling, the node will be a siblingless node -- either the root
      // of the tree, or a node on the rightmost branch.
      if (element.siblingIndex === null) {
        await this.updateHash(element.index, node, element.hash, tx)
      } else {
        siblingNode = await this.getNode(element.siblingIndex, tx)
        await this.updateHash(element.siblingIndex, siblingNode, element.hash, tx)
      }

      // Either the node or its sibling will be a left node, so we'll have the index of its parent.
      const parentIndex: number | undefined = siblingNode?.parentIndex ?? node.parentIndex
      Assert.isNotUndefined(parentIndex)

      // If we've reached the root node, there may be other subtrees to process,
      // so continue to the next hashStack element
      if (parentIndex === 0) {
        continue
      }

      // If we're not at a root node, hash the node with its sibling and push it back onto the stack.
      const parentNode = await this.getNode(parentIndex, tx)

      let newHash
      if (element.siblingIndex === null) {
        newHash = this.hasher.combineHash(element.depth + 1, element.hash, element.hash)
      } else {
        newHash =
          node.side === Side.Left
            ? this.hasher.combineHash(element.depth + 1, element.hash, node.hashOfSibling)
            : this.hasher.combineHash(element.depth + 1, node.hashOfSibling, element.hash)
      }

      hashStack.push({
        hash: newHash,
        index: parentIndex,
        siblingIndex: parentNode.leftIndex ?? null,
        depth: element.depth + 1,
      })
    }
  }

  /**
   * Updates hashOfSibling on a given node at a given index.
   */
  private updateHash(
    index: number,
    node: NodeValue<H>,
    hash: H,
    tx: IDatabaseTransaction,
  ): Promise<void> {
    return this.nodes.put(index, { ...node, hashOfSibling: hash }, tx)
  }
}

export enum Side {
  Left = 'Left',
  Right = 'Right',
}

export type LeafIndex = number
export type NodeIndex = number
