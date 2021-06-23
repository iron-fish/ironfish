/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { IJSON, JsonSerializable } from '../serde'
import {
  IDatabase,
  IDatabaseEncoding,
  IDatabaseStore,
  IDatabaseTransaction,
  JsonEncoding,
  SchemaValue,
} from '../storage'
import { MerkleHasher } from './hasher'
import { CounterSchema, LeavesSchema, NodesSchema, NodeValue, SCHEMA_VERSION } from './schema'
import { Witness, WitnessNode } from './witness'

/**
 * Represent whether a given node is the left or right subchild in a tree,
 * or an empty node with a known hash.
 */
export enum Side {
  Left = 'Left',
  Right = 'Right',
}

export type LeafIndex = number
export type NodeIndex = number

export default class MerkleTree<
  E,
  H,
  SE extends JsonSerializable,
  SH extends JsonSerializable
> {
  counter: IDatabaseStore<CounterSchema>
  leaves: IDatabaseStore<LeavesSchema<E, H>>
  nodes: IDatabaseStore<NodesSchema<H>>

  constructor(
    readonly merkleHasher: MerkleHasher<E, H, SE, SH>,
    readonly db: IDatabase,
    readonly treeName: string,
    readonly treeDepth: number = 32,
  ) {
    class LeafEncoding implements IDatabaseEncoding<LeavesSchema<E, H>['value']> {
      serialize = (value: LeavesSchema<E, H>['value']): Buffer => {
        const intermediate = {
          ...value,
          element: merkleHasher.elementSerde().serialize(value.element),
          merkleHash: merkleHasher.hashSerde().serialize(value.merkleHash),
        }
        return Buffer.from(IJSON.stringify(intermediate), 'utf8')
      }
      deserialize = (buffer: Buffer): LeavesSchema<E, H>['value'] => {
        const intermediate = IJSON.parse(buffer.toString('utf8')) as Omit<
          LeavesSchema<E, H>['value'],
          'element' | 'merkleHash'
        > & { element: SE; merkleHash: SH }
        return {
          ...intermediate,
          element: merkleHasher.elementSerde().deserialize(intermediate.element),
          merkleHash: merkleHasher.hashSerde().deserialize(intermediate.merkleHash),
        }
      }

      equals(): boolean {
        throw new Error('You should never use this')
      }
    }

    class NodeEncoding implements IDatabaseEncoding<NodeValue<H>> {
      serialize = (value: NodeValue<H>): Buffer => {
        const intermediate = {
          ...value,
          hashOfSibling: merkleHasher.hashSerde().serialize(value.hashOfSibling),
        }
        return Buffer.from(IJSON.stringify(intermediate), 'utf8')
      }
      deserialize = (buffer: Buffer): NodeValue<H> => {
        const intermediate = IJSON.parse(buffer.toString('utf8')) as Omit<
          NodeValue<H>,
          'hashOfSibling'
        > & { hashOfSibling: SH }

        return {
          ...intermediate,
          hashOfSibling: merkleHasher.hashSerde().deserialize(intermediate.hashOfSibling),
        }
      }

      equals(): boolean {
        throw new Error('You should never use this')
      }
    }

    this.counter = db.addStore({
      version: SCHEMA_VERSION,
      name: `${treeName}c`,
      keyEncoding: new JsonEncoding<CounterSchema['key']>(),
      valueEncoding: new JsonEncoding<CounterSchema['value']>(),
      upgrade: async (db, oldVersion, newVersion, tx): Promise<void> => {
        if (oldVersion === 0) {
          await this.counter.put('Leaves', 0, tx)
          await this.counter.put('Nodes', 1, tx)
        }
      },
    })

    this.leaves = db.addStore({
      version: SCHEMA_VERSION,
      name: `${treeName}l`,
      keyEncoding: new JsonEncoding<LeavesSchema<E, H>['key']>(),
      valueEncoding: new LeafEncoding(),
      keyPath: 'index',
    })

    this.nodes = db.addStore({
      version: SCHEMA_VERSION,
      name: `${treeName}n`,
      keyEncoding: new JsonEncoding<NodesSchema<H>['key']>(),
      valueEncoding: new NodeEncoding(),
      keyPath: 'index',
    })
  }

  /**
   * Get the number of leaf nodes (elements) in the tree.
   */
  async size(tx?: IDatabaseTransaction): Promise<number> {
    return await this.db.withTransaction(tx, [this.counter], 'read', async (tx) => {
      const value = await this.counter.get('Leaves', tx)

      if (value === undefined) {
        throw new Error(`No counter record found for tree ${this.treeName}`)
      }

      return value
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
      throw new Error(`No leaf found in tree ${this.treeName} at index ${index}`)
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
    return await this.db.withTransaction(tx, [this.leaves], 'read', async (tx) => {
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
      throw new Error(`No node found in tree ${this.treeName} at index ${index}`)
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
    const count = await this.counter.get(countType, tx)
    if (count === undefined) {
      throw new Error(`No counts found in tree ${this.treeName} for type ${countType}`)
    }
    return count
  }

  /** Iterate over all notes in the tree. This happens asynchronously
   * and behaviour is undefined if the tree changes while iterating.
   */
  async *notes(tx?: IDatabaseTransaction): AsyncGenerator<E, void, unknown> {
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
    await this.db.withTransaction(
      tx,
      [this.counter, this.leaves, this.nodes],
      'readwrite',
      async (tx) => {
        const merkleHash = this.merkleHasher.merkleHash(element)
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
          const hashOfSibling = this.merkleHasher.combineHash(
            0,
            leftLeaf.merkleHash,
            merkleHash,
          )

          await this.nodes.put(
            {
              side: Side.Left,
              parentIndex: 0,
              hashOfSibling,
              index: newParentIndex,
            },
            tx,
          )

          await this.leaves.put(
            {
              element: leftLeaf.element,
              merkleHash: leftLeaf.merkleHash,
              parentIndex: newParentIndex,
              index: leftLeafIndex,
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
          let myHash = this.merkleHasher.combineHash(0, merkleHash, merkleHash)
          let depth = 1
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

              await this.nodes.put(newNode, tx)
              nextNodeIndex += 1

              await this.counter.put('Nodes', nextNodeIndex, tx)

              if (!previousParent.parentIndex || isEmpty(previousParent.parentIndex)) {
                const newParent = {
                  side: Side.Left,
                  parentIndex: 0,
                  hashOfSibling: this.merkleHasher.combineHash(
                    depth,
                    previousParent.hashOfSibling,
                    myHash,
                  ),
                  index: nextNodeIndex,
                }

                await this.nodes.put(newParent, tx)

                await this.nodes.put(
                  {
                    side: Side.Left,
                    hashOfSibling: previousParent.hashOfSibling,
                    parentIndex: nextNodeIndex,
                    index: previousParentIndex,
                  },
                  tx,
                )

                nextNodeIndex += 1
                await this.counter.put('Nodes', nextNodeIndex, tx)
              }

              shouldContinue = false
            } else {
              // previous parent is a right node, gotta go up a step
              myHash = this.merkleHasher.combineHash(depth, myHash, myHash)

              if (previousParent.leftIndex === undefined) {
                throw new UnexpectedDatabaseError(`Parent has no left sibling`)
              }

              const leftSibling = await this.getNode(previousParent.leftIndex, tx)

              if (leftSibling.parentIndex === undefined) {
                throw new UnexpectedDatabaseError(`Left sibling has no parent`)
              }
              const leftSiblingParentIndex = leftSibling.parentIndex

              const newNode = {
                side: Side.Left,
                parentIndex: nextNodeIndex + 1, // where the next node will be (in the next iteration)
                hashOfSibling: myHash,
                index: nextNodeIndex,
              }
              await this.nodes.put(newNode, tx)

              nextNodeIndex += 1

              await this.counter.put('Nodes', nextNodeIndex, tx)

              previousParentIndex = leftSiblingParentIndex
              depth += 1
            }
          }
        }

        await this.counter.put('Leaves', indexOfNewLeaf + 1, tx)

        await this.leaves.put(
          {
            element,
            merkleHash,
            parentIndex: newParentIndex,
            index: indexOfNewLeaf,
          },
          tx,
        )

        await this.rehashRightPath(tx)
      },
    )
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
    return await this.db.withTransaction(
      tx,
      [this.counter, this.leaves, this.nodes],
      'readwrite',
      async (tx) => {
        const oldSize = await this.getCount('Leaves', tx)
        if (pastSize >= oldSize) {
          return
        }

        await this.counter.put('Leaves', pastSize, tx)

        if (pastSize === 0) {
          await this.counter.put('Nodes', 1, tx)
          return
        }

        if (pastSize === 1) {
          await this.counter.put('Nodes', 1, tx)
          const firstLeaf = await this.getLeaf(0, tx)
          firstLeaf.parentIndex = 0
          await this.leaves.put(firstLeaf, tx)
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
        await this.nodes.put(parent, tx)
        await this.counter.put('Nodes', maxParentIndex + 1, tx)
        await this.rehashRightPath(tx)
      },
    )
  }

  /**
   * Calculate what the root hash was at the time the tree contained
   * `pastSize` elements. Throws an error if the tree is empty,
   * the request size is greater than the size of the tree, or the requested
   * size is 0
   */
  async pastRoot(pastSize: number, tx?: IDatabaseTransaction): Promise<H> {
    return this.db.withTransaction(
      tx,
      [this.counter, this.leaves, this.nodes],
      'readwrite',
      async (tx) => {
        const leafCount = await this.getCount('Leaves', tx)

        if (leafCount === 0 || pastSize > leafCount || pastSize === 0) {
          throw new Error(
            `Unable to get past size ${pastSize} for tree with ${leafCount} nodes`,
          )
        }

        const rootDepth = depthAtLeafCount(pastSize)
        const minTreeDepth = Math.min(rootDepth, this.treeDepth)
        const leafIndex = pastSize - 1
        const leaf = await this.getLeaf(leafIndex, tx)

        let currentHash = leaf.merkleHash
        let currentNodeIndex = leaf.parentIndex

        if (isRight(leafIndex)) {
          const sibling = await this.getLeaf(leafIndex - 1, tx)
          const siblingHash = sibling.merkleHash
          currentHash = this.merkleHasher.combineHash(0, siblingHash, currentHash)
        } else {
          currentHash = this.merkleHasher.combineHash(0, currentHash, currentHash)
        }

        for (let depth = 1; depth < minTreeDepth; depth++) {
          const node = await this.getNode(currentNodeIndex, tx)

          switch (node.side) {
            case Side.Left:
              Assert.isNotUndefined(node.parentIndex)
              currentNodeIndex = node.parentIndex
              currentHash = this.merkleHasher.combineHash(depth, currentHash, currentHash)
              break

            case Side.Right: {
              Assert.isNotUndefined(node.leftIndex)
              const leftNode = await this.getNode(node.leftIndex, tx)
              Assert.isNotUndefined(leftNode.parentIndex)
              currentNodeIndex = leftNode.parentIndex
              currentHash = this.merkleHasher.combineHash(
                depth,
                node.hashOfSibling,
                currentHash,
              )
              break
            }

            default:
              Assert.isUnreachable(node.side)
          }
        }

        for (let depth = rootDepth; depth < this.treeDepth; depth++) {
          currentHash = this.merkleHasher.combineHash(depth, currentHash, currentHash)
        }

        return currentHash
      },
    )
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
   *
   * This is an inefficient linear scan.
   */
  async contained(value: E, pastSize: number, tx?: IDatabaseTransaction): Promise<boolean> {
    return this.db.withTransaction(
      tx,
      [this.counter, this.leaves, this.nodes],
      'readwrite',
      async (tx) => {
        for (let i = 0; i < pastSize; i++) {
          const leaf = await this.getLeafOrNull(i, tx)

          if (leaf === null) {
            break
          }

          if (this.merkleHasher.elementSerde().equals(value, leaf.element)) {
            return true
          }
        }
        return false
      },
    )
  }

  /**
   * Check if the tree currently contains the given element.
   */
  async contains(value: E, tx?: IDatabaseTransaction): Promise<boolean> {
    return await this.contained(value, await this.size(), tx)
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
    return this.db.withTransaction(
      tx,
      [this.counter, this.leaves, this.nodes],
      'readwrite',
      async (tx) => {
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
          currentHash = this.merkleHasher.combineHash(0, hashOfSibling, currentHash)
        } else if (index < leafCount - 1) {
          // Left leaf and have a right sibling
          const hashOfSibling = (await this.getLeaf(index + 1, tx)).merkleHash
          authenticationPath.push({ side: Side.Left, hashOfSibling })
          currentHash = this.merkleHasher.combineHash(0, currentHash, hashOfSibling)
        } else {
          // Left leaf and rightmost node
          authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
          currentHash = this.merkleHasher.combineHash(0, currentHash, currentHash)
        }

        for (let depth = 1; depth < this.treeDepth; depth++) {
          const node =
            currentPosition !== undefined ? await this.getNodeOrNull(currentPosition, tx) : null

          if (node === null) {
            authenticationPath.push({ side: Side.Left, hashOfSibling: currentHash })
            currentHash = this.merkleHasher.combineHash(depth, currentHash, currentHash)
          } else if (node.side === Side.Left) {
            authenticationPath.push({ side: Side.Left, hashOfSibling: node.hashOfSibling })
            currentHash = this.merkleHasher.combineHash(depth, currentHash, node.hashOfSibling)
            currentPosition = node.parentIndex
          } else {
            authenticationPath.push({ side: Side.Right, hashOfSibling: node.hashOfSibling })
            currentHash = this.merkleHasher.combineHash(depth, node.hashOfSibling, currentHash)
            Assert.isNotUndefined(node.leftIndex)
            const leftSibling = await this.getNode(node.leftIndex, tx)
            currentPosition = leftSibling.parentIndex
          }
        }

        return new Witness(leafCount, currentHash, authenticationPath, this.merkleHasher)
      },
    )
  }

  /**
   * Recalculate all the hashes between the most recently added leaf in the group
   * and the root hash.
   *
   * `transaction` is passed in so that a rollback happens for the entire change
   * if a conflict occurs.
   */
  private async rehashRightPath(tx: IDatabaseTransaction) {
    let depth = 0
    const leafIndex = (await this.getCount('Leaves', tx)) - 1
    const leaf = await this.getLeaf(leafIndex, tx)
    let parentIndex = leaf.parentIndex as NodeIndex | undefined
    const leafHash = leaf.merkleHash
    let parentHash

    if (isRight(leafIndex)) {
      const leftSiblingIndex = leafIndex - 1
      const leftSibling = await this.getLeaf(leftSiblingIndex, tx)
      const leftSiblingHash = leftSibling.merkleHash
      parentHash = this.merkleHasher.combineHash(depth, leftSiblingHash, leafHash)
    } else {
      parentHash = this.merkleHasher.combineHash(depth, leafHash, leafHash)
    }

    while (!isEmpty(parentIndex)) {
      const node = await this.getNode(parentIndex, tx)
      depth += 1

      switch (node.side) {
        case Side.Left: {
          // Since we are walking the rightmost path, left nodes do not
          // have right children. Therefore its sibling hash is set to its
          // own hash and its parent hash is set to the combination of that hash
          // with itself
          await this.nodes.put(
            {
              side: Side.Left,
              hashOfSibling: parentHash,
              parentIndex: node.parentIndex,
              index: parentIndex,
            },
            tx,
          )

          parentIndex = node.parentIndex
          parentHash = this.merkleHasher.combineHash(depth, parentHash, parentHash)
          break
        }

        case Side.Right: {
          // since this is a new right node, we know that we have the correct
          // hash because we set it correctly when we inserted it. But the left
          // node needs to have its hashOfSibling set to our current hash.
          if (node.leftIndex === undefined) {
            throw new Error(`Expected node ${node.index} to have left node`)
          }

          const leftNode = await this.getNode(node.leftIndex, tx)

          await this.nodes.put(
            {
              side: Side.Left,
              parentIndex: leftNode.parentIndex,
              hashOfSibling: parentHash,
              index: node.leftIndex,
            },
            tx,
          )

          parentIndex = leftNode.parentIndex
          parentHash = this.merkleHasher.combineHash(depth, node.hashOfSibling, parentHash)
          break
        }
      }
    }
  }
}

/**
 * Is the given leaf a right child or left child of its parent node.
 *
 * Leaves are added in order, so this is the same as asking if the index
 * is an od number
 */
function isRight(index: LeafIndex) {
  return index % 2 === 1
}

/**
 * Is the given node index the empty node above the root node?
 */
function isEmpty(index: NodeIndex | undefined): index is undefined | 0 {
  return index === 0 || index === undefined
}

/**
 * The depth of the tree when it contains a certain number of leaf nodes
 */
export function depthAtLeafCount(size: number): number {
  if (size === 0) {
    return 0
  }
  if (size === 1) {
    return 1
  }
  return Math.floor(Math.log2(size - 1)) + 2
}

export class UnexpectedDatabaseError extends Error {
  constructor(message?: string) {
    super(message || 'Inconsistent db state detected: Database was in an unexpected statef')
  }
}
