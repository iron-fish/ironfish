/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { JsonSerializable } from '../serde'
import {
  DatabaseKey,
  IDatabase,
  IDatabaseEncoding,
  IDatabaseStore,
  IDatabaseTransaction,
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
  readonly leaves: IDatabaseStore<LeavesSchema<E, H>>
  readonly leavesIndex: IDatabaseStore<LeavesIndexSchema<H>>
  readonly nodes: IDatabaseStore<NodesSchema<H>>

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
    leafEncoding: IDatabaseEncoding<LeavesSchema<E, H>['value']>
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
  async get(position: LeafIndex, tx?: IDatabaseTransaction): Promise<E> {
    return (await this.getLeaf(position, tx)).element
  }

  /**
   * Get the leaf element at the given index. Throws an error if the
   * index is not in bounds.
   */
  async getLeaf(
    index: LeafIndex,
    tx?: IDatabaseTransaction,
  ): Promise<SchemaValue<LeavesSchema<E, H>>> {
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
  ): Promise<SchemaValue<LeavesSchema<E, H>> | null> {
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

  /** Iterate over all leaves in the tree. This happens asynchronously
   * and behaviour is undefined if the tree changes while iterating.
   */
  async *getLeaves(tx?: IDatabaseTransaction): AsyncGenerator<E, void, unknown> {
    const numLeaves = await this.size(tx)

    for (let index = 0; index < numLeaves; index++) {
      const leaf = await this.getLeafOrNull(index, tx)
      if (leaf === null) {
        return
      }

      yield leaf.element
    }
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
      const merkleHash = this.hasher.merkleHash(element)
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
            element: leftLeaf.element,
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
          element,
          merkleHash,
          parentIndex: newParentIndex,
        },
        tx,
      )
    })
  }

  async addBatch(elements: Iterable<E>, tx?: IDatabaseTransaction): Promise<void> {
    const startingLeafIndex = await this.size(tx)

    for (const element of elements) {
      await this.addLeafWithNodes(element, tx)
    }

    await this.hashTree(startingLeafIndex, tx)
  }

  private async addLeaf(
    index: LeavesSchema<E, H>['key'],
    value: LeavesSchema<E, H>['value'],
    tx?: IDatabaseTransaction,
  ): Promise<void> {
    await this.leaves.put(
      index,
      {
        element: value.element,
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
    await this.db.withTransaction(tx, async (tx) => {
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

      return currentHash
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
   * Check if the tree contained the given element when it was the given size.
   */
  async contained(value: E, pastSize: number, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.db.withTransaction(tx, async (tx) => {
      const elementIndex = await this.leavesIndex.get(this.hasher.merkleHash(value), tx)

      return elementIndex !== undefined && elementIndex < pastSize
    })
  }

  /**
   * Check if the tree currently contains the given element.
   */
  async contains(value: E, tx?: IDatabaseTransaction): Promise<boolean> {
    return await this.contained(value, await this.size(tx), tx)
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
    tx?: IDatabaseTransaction,
  ): Promise<Witness<E, H, SE, SH> | null> {
    return this.db.withTransaction(tx, async (tx) => {
      const authenticationPath: WitnessNode<H>[] = []

      const leafCount = await this.size(tx)
      if (leafCount === 0 || index >= leafCount) {
        return null
      }

      const leaf = await this.getLeaf(index, tx)
      let currentHash = leaf.merkleHash
      let currentPosition = leaf.parentIndex as NodeIndex | undefined

      if (isRight(index)) {
        const hashOfSibling = (await this.getLeaf(index - 1, tx)).merkleHash
        authenticationPath.push({ side: Side.Right, hashOfSibling })
        currentHash = this.hasher.combineHash(0, hashOfSibling, currentHash)
      } else if (index < leafCount - 1) {
        // Left leaf and have a right sibling
        const hashOfSibling = (await this.getLeaf(index + 1, tx)).merkleHash
        authenticationPath.push({ side: Side.Left, hashOfSibling })
        currentHash = this.hasher.combineHash(0, currentHash, hashOfSibling)
      } else {
        // Left leaf and rightmost node
        authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
        currentHash = this.hasher.combineHash(0, currentHash, currentHash)
      }

      for (let depth = 1; depth < this.depth; depth++) {
        const node =
          currentPosition !== undefined ? await this.getNodeOrNull(currentPosition, tx) : null

        if (node === null) {
          authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
          currentHash = this.hasher.combineHash(depth, currentHash, currentHash)
        } else if (node.side === Side.Left) {
          authenticationPath.push({ side: Side.Left, hashOfSibling: node.hashOfSibling })
          currentHash = this.hasher.combineHash(depth, currentHash, node.hashOfSibling)
          currentPosition = node.parentIndex
        } else {
          authenticationPath.push({ side: Side.Right, hashOfSibling: node.hashOfSibling })
          currentHash = this.hasher.combineHash(depth, node.hashOfSibling, currentHash)
          Assert.isNotUndefined(node.leftIndex)
          const leftSibling = await this.getNode(node.leftIndex, tx)
          currentPosition = leftSibling.parentIndex
        }
      }

      return new Witness(leafCount, currentHash, authenticationPath, this.hasher)
    })
  }

  async hashTree(startingLeafIndex: number, tx?: IDatabaseTransaction): Promise<void> {
    await this.db.withTransaction(tx, async (tx) => {
      const leavesCount = await this.getCount('Leaves', tx)

      if (leavesCount <= 1 || startingLeafIndex > leavesCount - 1) {
        return
      }

      const hashStack: {
        hash: H
        intendedIndex: number
        depth: number
        siblingIndex: number | null
      }[] = []

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

        Assert.isEqual(leftLeaf.parentIndex, rightLeaf.parentIndex)

        let hash = this.hasher.combineHash(depth, leftLeaf.merkleHash, rightLeaf.merkleHash)
        let nodeIndex: number | undefined = leftLeaf.parentIndex
        let node: NodeValue<H> = await this.getNode(nodeIndex, tx)

        while (node.side === Side.Left && node.parentIndex !== 0) {
          const h = hashStack.pop()
          const stackHash = h?.hash ?? hash
          // Should only be undefined if on the right side of the tree
          // Ex: In a tree of 6 leaves, the two rightmost leaves will have
          // a parent node with no sibling node
          if (h === undefined) {
            await this.updateHash(nodeIndex, node, hash, tx)
          } else {
            Assert.isNotNull(h.siblingIndex)
            Assert.isEqual(nodeIndex, h.siblingIndex)

            const leftNode = await this.getNode(h.siblingIndex, tx)
            await this.updateHash(h.siblingIndex, leftNode, h.hash, tx)

            const rightNode = await this.getNode(h.intendedIndex, tx)
            await this.updateHash(h.intendedIndex, rightNode, hash, tx)
          }

          depth++

          nodeIndex = node.parentIndex
          Assert.isNotUndefined(nodeIndex)
          node = await this.getNode(nodeIndex, tx)
          hash = this.hasher.combineHash(depth, hash, stackHash)
        }

        if (node.parentIndex === 0) {
          await this.updateHash(nodeIndex, node, hash, tx)
        } else {
          Assert.isNotUndefined(node.leftIndex)
          hashStack.push({
            hash,
            depth,
            intendedIndex: nodeIndex,
            siblingIndex: node.leftIndex,
          })
        }
      }

      while (hashStack.length > 0) {
        // we have leftover hashes that need to be added
        const hash = hashStack.pop()
        Assert.isNotUndefined(hash)

        const node = await this.getNode(hash.intendedIndex, tx)
        let siblingNode

        // if sibling is null, look through hashStack to see if we've
        // joined up with another tree
        if (hash.siblingIndex === null) {
          for (let i = 0; i < hashStack.length; i++) {
            if (hashStack[i].siblingIndex === hash.intendedIndex) {
              hash.siblingIndex = hashStack[i].intendedIndex
            }
          }
        }

        // if sibling is still null, the node should either be the root or the rightmost branch
        if (hash.siblingIndex === null) {
          await this.updateHash(hash.intendedIndex, node, hash.hash, tx)
        } else {
          siblingNode = await this.getNode(hash.siblingIndex, tx)
          await this.updateHash(hash.siblingIndex, siblingNode, hash.hash, tx)
        }

        const parentIndex: number | undefined = siblingNode?.parentIndex ?? node.parentIndex
        Assert.isNotUndefined(parentIndex)

        if (parentIndex !== 0) {
          const parentNode = await this.getNode(parentIndex, tx)

          let newHash
          if (hash.siblingIndex === null) {
            newHash = this.hasher.combineHash(hash.depth + 1, hash.hash, hash.hash)
          } else {
            newHash =
              node.side === 'Left'
                ? this.hasher.combineHash(hash.depth + 1, hash.hash, node.hashOfSibling)
                : this.hasher.combineHash(hash.depth + 1, node.hashOfSibling, hash.hash)
          }

          hashStack.push({
            hash: newHash,
            intendedIndex: parentIndex,
            siblingIndex: parentNode.leftIndex ?? null,
            depth: hash.depth + 1,
          })
        }
      }
    })
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
