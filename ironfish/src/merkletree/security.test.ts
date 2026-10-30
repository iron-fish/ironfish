/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { makeTree } from '../testUtilities/helpers/merkletree'
import { StructureHasher } from './hasher'
import { MerkleTree, Side } from './merkletree'
import { Witness } from './witness'

type TestTree = MerkleTree<string, string, string, string>

// A deliberately simple oracle: build each populated layer from scratch, with
// no database nodes, cached roots, or incremental update algorithm.
function referenceRoot(leaves: string[], depth: number): string {
  const hasher = new StructureHasher()
  let layer = leaves
  for (let level = 0; level < depth; level++) {
    const parents = []
    for (let i = 0; i < layer.length; i += 2) {
      parents.push(hasher.combineHash(level, layer[i], layer[i + 1] ?? '~'))
    }
    layer = parents
  }
  Assert.isEqual(layer.length, 1)
  return layer[0]
}

async function checkTree(tree: TestTree, leaves: string[]): Promise<void> {
  expect(await tree.size()).toBe(leaves.length)
  if (leaves.length === 0) {
    await expect(tree.rootHash()).rejects.toThrow()
    await expect(tree.witness(0)).resolves.toBeNull()
    return
  }
  const expected = referenceRoot(leaves, tree.depth)
  expect(await tree.rootHash()).toBe(expected)
  for (let index = 0; index < leaves.length; index++) {
    const witness = await tree.witness(index)
    Assert.isNotNull(witness)
    expect(witness.authenticationPath).toHaveLength(tree.depth)
    expect(witness.rootHash).toBe(expected)
    expect(witness.verify(leaves[index])).toBe(true)
    expect(await tree.contains(leaves[index])).toBe(true)
  }
}

describe('Merkle tree adversarial regression tests', () => {
  it.each([0, -1, 1.5, NaN, Infinity, 33])('rejects invalid depth %s', async (depth) => {
    await expect(makeTree({ depth })).rejects.toThrow(/depth/)
  })

  it.each([1, 2, 3, 4, 5, 6])(
    'binds every leaf to its position at every size for depth %i',
    async (depth) => {
      const tree = await makeTree({ depth })
      const capacity = 2 ** depth
      const leaves = Array.from({ length: capacity }, (_, i) => `leaf${i}`)
      const roots: string[] = []
      for (let size = 1; size <= capacity; size++) {
        await tree.add(leaves[size - 1])
        const expected = referenceRoot(leaves.slice(0, size), depth)
        expect(await tree.rootHash()).toBe(expected)
        roots.push(expected)
        for (let index = 0; index < size; index++) {
          const witness = await tree.witness(index)
          Assert.isNotNull(witness)
          expect(witness.rootHash).toBe(expected)
          expect(witness.authenticationPath).toHaveLength(depth)
          // Try every possible position, including positions beyond tree size.
          // The proof verifier itself does not check the declared tree size.
          for (let position = 0; position < capacity; position++) {
            const path = witness.authenticationPath.map((node, level) => ({
              ...node,
              side: Math.floor(position / 2 ** level) % 2 ? Side.Right : Side.Left,
            }))
            const forged = new Witness(size, expected, path, tree.hasher)
            expect(forged.verify(leaves[index])).toBe(position === index)
          }
        }
      }
      // Ask the fully grown tree for all historical witnesses. A later sibling
      // must never leak into a witness for an earlier tree size.
      for (let size = 1; size <= capacity; size++) {
        expect(await tree.pastRoot(size)).toBe(roots[size - 1])
        for (let index = 0; index < size; index++) {
          const witness = await tree.witness(index, size)
          Assert.isNotNull(witness)
          expect(witness.rootHash).toBe(roots[size - 1])
          expect(witness.verify(leaves[index])).toBe(true)
        }
        await expect(tree.witness(size, size)).resolves.toBeNull()
      }
    },
    30000,
  )

  it('rejects a copied padding position and a duplicated-final-leaf root', async () => {
    const tree = await makeTree({ depth: 4, leaves: 'abc' })
    const witness = await tree.witness(2)
    Assert.isNotNull(witness)
    for (const level of [0, 2, 3]) {
      const path = witness.authenticationPath.map((node) => ({ ...node }))
      path[level].side = Side.Right
      expect(new Witness(3, witness.rootHash, path, tree.hasher).verify('c')).toBe(false)
    }
    const root = await tree.rootHash()
    await tree.add('c')
    expect(await tree.rootHash()).not.toBe(root)
  })

  it('matches depth-32 roots and witnesses across larger power-of-two boundaries', async () => {
    const tree = await makeTree({ depth: 32 })
    const leaves = Array.from({ length: 129 }, (_, i) => `leaf${i}`)
    const sizes = [1, 2, 3, 31, 32, 33, 63, 64, 65, 127, 128, 129]
    const roots = new Map<number, string>()

    for (let size = 1; size <= leaves.length; size++) {
      await tree.add(leaves[size - 1])
      if (!sizes.includes(size)) {
        continue
      }
      const expected = referenceRoot(leaves.slice(0, size), 32)
      roots.set(size, expected)
      expect(await tree.rootHash()).toBe(expected)
      for (const index of new Set([0, Math.floor((size - 1) / 2), size - 1])) {
        const witness = await tree.witness(index)
        Assert.isNotNull(witness)
        expect(witness.rootHash).toBe(expected)
        expect(witness.verify(leaves[index])).toBe(true)
        const copiedPosition = witness.authenticationPath.map((node) => ({ ...node }))
        copiedPosition[31].side = Side.Right
        expect(
          new Witness(size, expected, copiedPosition, tree.hasher).verify(leaves[index]),
        ).toBe(false)
      }
    }

    for (const size of sizes) {
      expect(await tree.pastRoot(size)).toBe(roots.get(size))
      const index = size - 1
      const witness = await tree.witness(index, size)
      Assert.isNotNull(witness)
      expect(witness.rootHash).toBe(roots.get(size))
      expect(witness.verify(leaves[index])).toBe(true)
    }

    await tree.truncate(64)
    expect(await tree.rootHash()).toBe(roots.get(64))
    await tree.addBatch(['new64', 'new65'])
    const expected = referenceRoot([...leaves.slice(0, 64), 'new64', 'new65'], 32)
    expect(await tree.rootHash()).toBe(expected)
    const witness = await tree.witness(65)
    Assert.isNotNull(witness)
    expect(witness.rootHash).toBe(expected)
    expect(witness.verify('new65')).toBe(true)
  }, 30000)

  it('keeps membership for duplicate commitments retained after a rollback', async () => {
    const tree = await makeTree({ depth: 4, leaves: 'abacadaba' })
    await checkTree(tree, [...'abacadaba'])
    for (let size = 8; size >= 1; size--) {
      await tree.truncate(size)
      await checkTree(tree, [...'abacadaba'.slice(0, size)])
    }
    await tree.truncate(0)
    await expect(tree.contains('a')).resolves.toBe(false)
    await tree.addBatch('aba')
    await checkTree(tree, [...'aba'])
  })

  it('does not expose physically retained leaves after truncation', async () => {
    const tree = await makeTree({ depth: 4, leaves: 'abcd' })
    await tree.truncate(2)
    await expect(tree.getLeafOrNull(2)).resolves.toBeNull()
    await expect(tree.getLeaf(3)).rejects.toThrow(/No leaf/)
    await expect(tree.getLeafOrNull(-1)).rejects.toThrow(/Invalid/)
    await tree.addBatch('xy')
    await checkTree(tree, [...'abxy'])
  })

  it('treats a zero-size historical witness as empty', async () => {
    const tree = await makeTree({ leaves: 'abc' })
    await expect(tree.witness(0, 0)).resolves.toBeNull()
  })

  it.each([-1, 0.5, NaN, Infinity, 2 ** 32])('rejects invalid size %s', async (size) => {
    const tree = await makeTree({ leaves: 'abc' })
    const root = await tree.rootHash()
    await expect(tree.pastRoot(size)).rejects.toThrow()
    await expect(tree.pastRightSiblingHashes(size)).rejects.toThrow()
    await expect(tree.witness(0, size)).rejects.toThrow()
    await expect(tree.truncate(size)).rejects.toThrow()
    expect(await tree.rootHash()).toBe(root)
    expect(await tree.size()).toBe(3)
  })

  it.each([-1, 0.5, NaN, Infinity])('rejects invalid witness index %s', async (index) => {
    const tree = await makeTree({ leaves: 'abc' })
    await expect(tree.witness(index)).rejects.toThrow()
  })

  it('rejects overfilling without partially committing a batch', async () => {
    const tree = await makeTree({ depth: 2, leaves: 'abc' })
    const root = await tree.rootHash()
    await expect(tree.addBatch('de')).rejects.toThrow(/full|capacity/i)
    expect(await tree.size()).toBe(3)
    expect(await tree.rootHash()).toBe(root)
    await tree.add('d')
    await checkTree(tree, [...'abcd'])
    await expect(tree.add('e')).rejects.toThrow(/full|capacity/i)
    await checkTree(tree, [...'abcd'])
  })

  it('rejects a real leaf equal to the empty marker', async () => {
    const tree = await makeTree({ leaves: 'a' })
    const root = await tree.rootHash()
    await expect(tree.add('~')).rejects.toThrow(/empty/i)
    await expect(tree.addBatch('b~')).rejects.toThrow(/empty/i)
    expect(await tree.size()).toBe(1)
    expect(await tree.rootHash()).toBe(root)
  })

  it('invalidates roots after waiting for an earlier transaction to commit', async () => {
    const tree = await makeTree({ depth: 4, leaves: 'abc' })
    const tx = tree.db.transaction()
    await tree.pastRoot(3, tx)
    // Queue a truncate while tx still owns the database lock. Promoting tx's
    // cached root must not repopulate a stale branch after invalidation.
    const truncating = tree.truncate(1)
    await tx.commit()
    tree.pastRootTxCommitted(tx)
    await truncating
    await tree.addBatch('xy')
    expect(await tree.pastRoot(3)).toBe(referenceRoot([...'axy'], 4))
    await checkTree(tree, [...'axy'])
  })

  it('does not promote an old transaction root after truncation', async () => {
    const tree = await makeTree({ depth: 4, leaves: 'abc' })
    const tx = tree.db.transaction()
    await tree.pastRoot(3, tx)
    await tx.commit()
    await tree.truncate(1)
    await tree.addBatch('xy')
    tree.pastRootTxCommitted(tx)
    expect(await tree.pastRoot(3)).toBe(referenceRoot([...'axy'], 4))
  })

  it('rejects a leaf count which cannot be represented by the u32 counter', async () => {
    const tree = await makeTree({ depth: 32 })
    const count = jest.spyOn(tree, 'getCount').mockResolvedValue(0xffffffff)
    try {
      await expect(tree.add('a')).rejects.toThrow(/full/)
    } finally {
      count.mockRestore()
    }
    await expect(tree.size()).resolves.toBe(0)
  })

  it.each([0xfffffffe, 0xffffffff])(
    'rejects node counter exhaustion at %i without changing the tree',
    async (nodeCount) => {
      const tree = await makeTree({ depth: 32, leaves: 'ab' })
      const root = await tree.rootHash()
      const getCount = tree.getCount.bind(tree)
      const count = jest
        .spyOn(tree, 'getCount')
        .mockImplementation((kind, tx) =>
          kind === 'Nodes' ? Promise.resolve(nodeCount) : getCount(kind, tx),
        )
      try {
        await expect(tree.add('c')).rejects.toThrow(/full: no node indices remain/)
      } finally {
        count.mockRestore()
      }
      expect(await tree.size()).toBe(2)
      expect(await tree.rootHash()).toBe(root)
    },
  )

  it('matches the oracle across deterministic append, rollback, abort, and reopen sequences', async () => {
    const tree = await makeTree({ depth: 6 })
    let leaves: string[] = []
    let seed = 0x613fac
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let step = 0; step < 120; step++) {
      const tx = tree.db.transaction()
      const rollback = step % 11 === 0
      let candidate = leaves.slice()
      try {
        if (candidate.length && (next() % 3 === 0 || candidate.length > 55)) {
          const size = next() % candidate.length
          await tree.truncate(size, tx)
          candidate = candidate.slice(0, size)
        } else {
          const added = Array.from({ length: 1 + (next() % 5) }, () => `leaf${next() % 13}`)
          await tree.addBatch(added, tx)
          candidate.push(...added)
        }
        if (candidate.length) {
          expect(await tree.rootHash(tx)).toBe(referenceRoot(candidate, tree.depth))
        }
        if (rollback) {
          await tx.abort()
        } else {
          await tx.commit()
          tree.pastRootTxCommitted(tx)
          leaves = candidate
        }
      } catch (error) {
        await tx.abort()
        throw error
      }
      await checkTree(tree, leaves)
      if (step % 17 === 0) {
        await tree.db.close()
        await tree.db.open()
        await checkTree(tree, leaves)
      }
    }
    expect(await tree.size()).toBe(leaves.length)
  }, 30000)
})
