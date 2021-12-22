/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../testUtilities/matchers/merkletree'
import { makeTree } from '../testUtilities/helpers/merkletree'
import { MerkleTree, Side } from './merkletree'
import { depthAtLeafCount } from './utils'

describe('Merkle tree', function () {
  it('initializes database', async () => {
    const tree = await makeTree()

    await expect(tree.size()).resolves.toBe(0)
    await expect(tree.getCount('Leaves')).resolves.toBe(0)
    await expect(tree.getCount('Nodes')).resolves.toBe(1)
  })

  it("doesn't reset db on second run", async () => {
    const tree1 = await makeTree()
    await tree1.add('a')
    await expect(tree1.size()).resolves.toBe(1)
    await tree1.db.close()

    const tree2 = await makeTree({ db: tree1.db })
    await expect(tree2.size()).resolves.toBe(1)
    await tree2.db.close()
  })

  it('maintains two separate trees', async () => {
    const tree1 = await makeTree({ depth: 4, name: 'A' })
    await tree1.db.close()
    const tree2 = await makeTree({ depth: 4, name: 'B', db: tree1.db })

    await tree1.add('a')
    await tree2.add('A')
    await tree2.add('B')

    expect(await tree1.size()).toBe(1)
    expect(await tree1.get(0)).toBe('a')
    expect(await tree1.rootHash()).toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )

    expect(await tree2.size()).toBe(2)
    expect(await tree2.get(0)).toBe('A')
    expect(await tree2.get(1)).toBe('B')
    expect(await tree2.rootHash()).toBe(
      '<<<<A|B-0>|<A|B-0>-1>|<<A|B-0>|<A|B-0>-1>-2>|<<<A|B-0>|<A|B-0>-1>|<<A|B-0>|<A|B-0>-1>-2>-3>',
    )
  })

  it('adds nodes correctly', async () => {
    const tree = await makeTree()

    await tree.add('a')
    await expect(tree).toHaveLeaves('a', [0])
    await expect(tree).toHaveNodes([])

    await tree.add('b')
    await expect(tree).toHaveLeaves('ab', [1, 1])
    await expect(tree).toHaveNodes([[1, Side.Left, 0, '<a|b-0>']])

    await tree.add('c')
    await expect(tree).toHaveLeaves('abc', [1, 1, 2])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|c-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 0, '<<a|b-0>|<c|c-0>-1>'],
    ])

    await tree.add('d')
    await expect(tree).toHaveLeaves('abcd', [1, 1, 2, 2])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|d-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 0, '<<a|b-0>|<c|d-0>-1>'],
    ])

    await tree.add('e')
    await expect(tree).toHaveLeaves('abcde', [1, 1, 2, 2, 4])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|d-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 6, '<<e|e-0>|<e|e-0>-1>'],
      [4, Side.Left, 5, '<e|e-0>'],
      [5, Side.Right, 3, '<<a|b-0>|<c|d-0>-1>'],
      [6, Side.Left, 0, '<<<a|b-0>|<c|d-0>-1>|<<e|e-0>|<e|e-0>-1>-2>'],
    ])

    await tree.add('f')
    await expect(tree).toHaveLeaves('abcdef', [1, 1, 2, 2, 4, 4])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|d-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 6, '<<e|f-0>|<e|f-0>-1>'],
      [4, Side.Left, 5, '<e|f-0>'],
      [5, Side.Right, 3, '<<a|b-0>|<c|d-0>-1>'],
      [6, Side.Left, 0, '<<<a|b-0>|<c|d-0>-1>|<<e|f-0>|<e|f-0>-1>-2>'],
    ])

    await tree.add('g')
    await expect(tree).toHaveLeaves('abcdefg', [1, 1, 2, 2, 4, 4, 7])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|d-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 6, '<<e|f-0>|<g|g-0>-1>'],
      [4, Side.Left, 5, '<g|g-0>'],
      [5, Side.Right, 3, '<<a|b-0>|<c|d-0>-1>'],
      [6, Side.Left, 0, '<<<a|b-0>|<c|d-0>-1>|<<e|f-0>|<g|g-0>-1>-2>'],
      [7, Side.Right, 4, '<e|f-0>'],
    ])

    await tree.add('h')
    await expect(tree).toHaveLeaves('abcdefgh', [1, 1, 2, 2, 4, 4, 7, 7])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|d-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 6, '<<e|f-0>|<g|h-0>-1>'],
      [4, Side.Left, 5, '<g|h-0>'],
      [5, Side.Right, 3, '<<a|b-0>|<c|d-0>-1>'],
      [6, Side.Left, 0, '<<<a|b-0>|<c|d-0>-1>|<<e|f-0>|<g|h-0>-1>-2>'],
      [7, Side.Right, 4, '<e|f-0>'],
    ])

    await tree.add('i')
    await expect(tree).toHaveLeaves('abcdefghi', [1, 1, 2, 2, 4, 4, 7, 7, 8])
    await expect(tree).toHaveNodes([
      [1, Side.Left, 3, '<c|d-0>'],
      [2, Side.Right, 1, '<a|b-0>'],
      [3, Side.Left, 6, '<<e|f-0>|<g|h-0>-1>'],
      [4, Side.Left, 5, '<g|h-0>'],
      [5, Side.Right, 3, '<<a|b-0>|<c|d-0>-1>'],
      [6, Side.Left, 11, '<<<i|i-0>|<i|i-0>-1>|<<i|i-0>|<i|i-0>-1>-2>'],
      [7, Side.Right, 4, '<e|f-0>'],
      [8, Side.Left, 9, '<i|i-0>'],
      [9, Side.Left, 10, '<<i|i-0>|<i|i-0>-1>'],
      [10, Side.Right, 6, '<<<a|b-0>|<c|d-0>-1>|<<e|f-0>|<g|h-0>-1>-2>'],
      [
        11,
        Side.Left,
        0,
        '<<<<a|b-0>|<c|d-0>-1>|<<e|f-0>|<g|h-0>-1>-2>|<<<i|i-0>|<i|i-0>-1>|<<i|i-0>|<i|i-0>-1>-2>-3>',
      ],
    ])
  })

  it('truncates nodes correctly', async () => {
    let tree = await makeTree({ leaves: 'abcdefghijklmnop' })
    await tree.truncate(0)
    await expect(tree).toMatchTree(await makeTree({ leaves: '' }))

    tree = await makeTree({ leaves: 'abcdefghijklmnop' })
    await tree.truncate(11)
    await expect(tree).toMatchTree(await makeTree({ leaves: 'abcdefghijk' }))

    tree = await makeTree({ leaves: 'abcdefghijklmnop' })
    await tree.truncate(17)
    await expect(tree).toMatchTree(await makeTree({ leaves: 'abcdefghijklmnop' }))
  })

  it('adds to tree after truncating', async () => {
    const tree = await makeTree({ leaves: 'abcdefghijklmnop' })
    await tree.truncate(1)
    await tree.add('x')
    await tree.add('y')

    await expect(tree).toMatchTree(await makeTree({ leaves: 'axy' }))
    await expect(tree.size()).resolves.toBe(3)
  })

  it('iterates over notes', async () => {
    const tree = await makeTree({ leaves: 'abcd' })

    let notes = ''
    for await (const note of tree.notes()) {
      notes += note
    }

    expect(notes).toBe('abcd')
  })

  it('calculates past and current root hashes correctly', async () => {
    const tree = await makeTree({ depth: 4 })

    await expect(tree.rootHash()).rejects.toThrowError(
      `Unable to get past size 0 for tree with 0 nodes`,
    )
    await expect(tree.pastRoot(0)).rejects.toThrowError(
      `Unable to get past size 0 for tree with 0 nodes`,
    )
    await expect(tree.pastRoot(1)).rejects.toThrowError(
      `Unable to get past size 1 for tree with 0 nodes`,
    )

    await tree.add('a')
    await expect(tree.rootHash()).resolves.toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(1)).resolves.toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(2)).rejects.toThrowError(
      `Unable to get past size 2 for tree with 1 nodes`,
    )

    await tree.add('b')
    await expect(tree.rootHash()).resolves.toBe(
      '<<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>|<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(1)).resolves.toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(2)).resolves.toBe(
      '<<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>|<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(3)).rejects.toThrowError(
      `Unable to get past size 3 for tree with 2 nodes`,
    )

    await tree.add('c')
    await expect(tree.rootHash()).resolves.toBe(
      '<<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>|<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(1)).resolves.toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(2)).resolves.toBe(
      '<<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>|<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(3)).resolves.toBe(
      '<<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>|<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(4)).rejects.toThrowError(
      `Unable to get past size 4 for tree with 3 nodes`,
    )

    await tree.add('d')
    await expect(tree.rootHash()).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(1)).resolves.toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(2)).resolves.toBe(
      '<<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>|<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(3)).resolves.toBe(
      '<<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>|<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(4)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(5)).rejects.toThrowError(
      `Unable to get past size 5 for tree with 4 nodes`,
    )

    // Now add 12 more leaves
    for (let i = 0; i < 12; i++) {
      await tree.add(String(i))
    }
    await expect(tree.rootHash()).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|7-0>-1>|<<8|9-0>|<10|11-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(1)).resolves.toBe(
      '<<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>|<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(2)).resolves.toBe(
      '<<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>|<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(3)).resolves.toBe(
      '<<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>|<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(4)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(5)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|0-0>|<0|0-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<0|0-0>|<0|0-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(6)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<0|1-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<0|1-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(7)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|2-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|2-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(8)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(9)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|4-0>|<4|4-0>-1>|<<4|4-0>|<4|4-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(10)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<4|5-0>-1>|<<4|5-0>|<4|5-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(11)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|6-0>-1>|<<4|5-0>|<6|6-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(12)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|7-0>-1>|<<4|5-0>|<6|7-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(13)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|7-0>-1>|<<8|8-0>|<8|8-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(14)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|7-0>-1>|<<8|9-0>|<8|9-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(15)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|7-0>-1>|<<8|9-0>|<10|10-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(16)).resolves.toBe(
      '<<<<a|b-0>|<c|d-0>-1>|<<0|1-0>|<2|3-0>-1>-2>|<<<4|5-0>|<6|7-0>-1>|<<8|9-0>|<10|11-0>-1>-2>-3>',
    )
    await expect(tree.pastRoot(17)).rejects.toThrowError(
      `Unable to get past size 17 for tree with 16 nodes`,
    )
  })

  it('finds contained values', async () => {
    const tree = await makeTree()

    for (let i = 1; i < 32; i++) {
      await tree.add(String(i))
      expect(await tree.contains(String(i))).toBe(true)
      expect(await tree.contains(String(i + 1))).toBe(false)
    }
  })

  it('does not find value after truncating tree', async () => {
    const tree = await makeTree()
    const elementSize = 32

    for (let i = 0; i < elementSize; i++) {
      const element = String(i)
      await tree.add(element)

      expect(await tree.contains(element)).toBe(true)
    }

    for (let i = elementSize - 1; i > 0; i--) {
      // truncate the tree by 1 and check that the last value isn't there
      const element = String(i)
      await tree.truncate(i)

      expect(await tree.contains(element)).toBe(false)
      expect(await tree.contained(element, elementSize)).toBe(false)

      // check that the rest of the elements are still there
      for (let j = 0; j < i; j++) {
        expect(await tree.contains(String(j))).toBe(true)
      }
    }
  })

  it('calculates correct witnesses', async () => {
    const witnessOrThrowFactory =
      (witnessTree: MerkleTree<string, string, string, string>) => async (index: number) => {
        const witness = await witnessTree.witness(index)
        if (witness === null) {
          throw new Error(`Witness at ${index} was unexpectedly null`)
        }
        return witness
      }

    const tree = await makeTree({ depth: 3 })
    const witnessOrThrow = witnessOrThrowFactory(tree)

    await expect(tree.witness(0)).resolves.toBe(null)
    await tree.add('a')
    await expect(tree.witness(1)).resolves.toBe(null)

    let witness = await witnessOrThrow(0)
    expect(witness.verify('a')).toBe(true)
    expect(witness.verify('b')).toBe(false)
    let expectedRoot = '<<<a|a-0>|<a|a-0>-1>|<<a|a-0>|<a|a-0>-1>-2>'
    expect(witness).toMatchWitness(1, expectedRoot, [
      [Side.Left, 'a'],
      [Side.Left, '<a|a-0>'],
      [Side.Left, '<<a|a-0>|<a|a-0>-1>'],
    ])

    await tree.add('b')
    await expect(tree.witness(2)).resolves.toBe(null)
    expectedRoot = '<<<a|b-0>|<a|b-0>-1>|<<a|b-0>|<a|b-0>-1>-2>'
    witness = await witnessOrThrow(0)
    expect(witness.verify('a')).toBe(true)
    expect(witness.verify('b')).toBe(false)
    expect(witness).toMatchWitness(2, expectedRoot, [
      [Side.Left, 'b'],
      [Side.Left, '<a|b-0>'],
      [Side.Left, '<<a|b-0>|<a|b-0>-1>'],
    ])
    witness = await witnessOrThrow(1)
    expect(witness.verify('b')).toBe(true)
    expect(witness).toMatchWitness(2, expectedRoot, [
      [Side.Right, 'a'],
      [Side.Left, '<a|b-0>'],
      [Side.Left, '<<a|b-0>|<a|b-0>-1>'],
    ])

    await tree.add('c')
    await expect(tree.witness(3)).resolves.toBe(null)
    expectedRoot = '<<<a|b-0>|<c|c-0>-1>|<<a|b-0>|<c|c-0>-1>-2>'
    witness = await witnessOrThrow(0)
    expect(witness.verify('a')).toBe(true)
    expect(witness).toMatchWitness(3, expectedRoot, [
      [Side.Left, 'b'],
      [Side.Left, '<c|c-0>'],
      [Side.Left, '<<a|b-0>|<c|c-0>-1>'],
    ])
    witness = await witnessOrThrow(1)
    expect(witness.verify('b')).toBe(true)
    expect(witness).toMatchWitness(3, expectedRoot, [
      [Side.Right, 'a'],
      [Side.Left, '<c|c-0>'],
      [Side.Left, '<<a|b-0>|<c|c-0>-1>'],
    ])
    witness = await witnessOrThrow(2)
    expect(witness.verify('c')).toBe(true)
    expect(witness).toMatchWitness(3, expectedRoot, [
      [Side.Left, 'c'],
      [Side.Right, '<a|b-0>'],
      [Side.Left, '<<a|b-0>|<c|c-0>-1>'],
    ])
    await tree.add('d')
    await expect(tree.witness(4)).resolves.toBe(null)
    expectedRoot = '<<<a|b-0>|<c|d-0>-1>|<<a|b-0>|<c|d-0>-1>-2>'
    witness = await witnessOrThrow(0)
    expect(witness.verify('a')).toBe(true)
    expect(witness).toMatchWitness(4, expectedRoot, [
      [Side.Left, 'b'],
      [Side.Left, '<c|d-0>'],
      [Side.Left, '<<a|b-0>|<c|d-0>-1>'],
    ])
    witness = await witnessOrThrow(1)
    expect(witness.verify('b')).toBe(true)
    expect(witness).toMatchWitness(4, expectedRoot, [
      [Side.Right, 'a'],
      [Side.Left, '<c|d-0>'],
      [Side.Left, '<<a|b-0>|<c|d-0>-1>'],
    ])
    witness = await witnessOrThrow(2)
    expect(witness.verify('c')).toBe(true)
    expect(witness).toMatchWitness(4, expectedRoot, [
      [Side.Left, 'd'],
      [Side.Right, '<a|b-0>'],
      [Side.Left, '<<a|b-0>|<c|d-0>-1>'],
    ])
    witness = await witnessOrThrow(3)
    expect(witness.verify('d')).toBe(true)
    expect(witness).toMatchWitness(4, expectedRoot, [
      [Side.Right, 'c'],
      [Side.Right, '<a|b-0>'],
      [Side.Left, '<<a|b-0>|<c|d-0>-1>'],
    ])

    await tree.add('e')
    await tree.add('f')
    await tree.add('g')
    await tree.add('h')
    await expect(tree.witness(8)).resolves.toBe(null)
    expectedRoot = '<<<a|b-0>|<c|d-0>-1>|<<e|f-0>|<g|h-0>-1>-2>'
    witness = await witnessOrThrow(0)
    expect(witness.verify('a')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Left, 'b'],
      [Side.Left, '<c|d-0>'],
      [Side.Left, '<<e|f-0>|<g|h-0>-1>'],
    ])
    witness = await witnessOrThrow(1)
    expect(witness.verify('b')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Right, 'a'],
      [Side.Left, '<c|d-0>'],
      [Side.Left, '<<e|f-0>|<g|h-0>-1>'],
    ])
    witness = await witnessOrThrow(2)
    expect(witness.verify('c')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Left, 'd'],
      [Side.Right, '<a|b-0>'],
      [Side.Left, '<<e|f-0>|<g|h-0>-1>'],
    ])
    witness = await witnessOrThrow(3)
    expect(witness.verify('d')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Right, 'c'],
      [Side.Right, '<a|b-0>'],
      [Side.Left, '<<e|f-0>|<g|h-0>-1>'],
    ])
    witness = await witnessOrThrow(4)
    expect(witness.verify('e')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Left, 'f'],
      [Side.Left, '<g|h-0>'],
      [Side.Right, '<<a|b-0>|<c|d-0>-1>'],
    ])
    witness = await witnessOrThrow(5)
    expect(witness.verify('f')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Right, 'e'],
      [Side.Left, '<g|h-0>'],
      [Side.Right, '<<a|b-0>|<c|d-0>-1>'],
    ])
    witness = await witnessOrThrow(6)
    expect(witness.verify('g')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Left, 'h'],
      [Side.Right, '<e|f-0>'],
      [Side.Right, '<<a|b-0>|<c|d-0>-1>'],
    ])
    witness = await witnessOrThrow(7)
    expect(witness.verify('h')).toBe(true)
    expect(witness).toMatchWitness(8, expectedRoot, [
      [Side.Right, 'g'],
      [Side.Right, '<e|f-0>'],
      [Side.Right, '<<a|b-0>|<c|d-0>-1>'],
    ])
  })

  it('witness rootHash should equal the tree rootHash', async () => {
    const tree = await makeTree({ depth: 3 })
    await tree.add('a')
    await tree.add('b')
    await tree.add('c')
    await tree.add('d')
    await tree.add('e')
    await tree.add('f')
    await tree.add('g')
    await tree.add('h')

    const rootHash = await tree.rootHash()
    for (let i = 0; i < (await tree.size()); i++) {
      const witness = await tree.witness(i)
      if (witness === null) {
        throw new Error('Witness should not be null')
      }
      expect(witness.rootHash).toEqual(rootHash)
    }
  })

  it("throws an error when getting a position that doesn't exist", async () => {
    const tree = await makeTree()
    await expect(() => tree.get(99)).rejects.toThrowError(
      `No leaf found in tree ${tree.name} at index 99`,
    )

    await tree.add('1')
    await expect(() => tree.get(99)).rejects.toThrowError(
      `No leaf found in tree ${tree.name} at index 99`,
    )
  })

  it('calculates correct depths', () => {
    expect(depthAtLeafCount(0)).toBe(0)
    expect(depthAtLeafCount(1)).toBe(1)
    expect(depthAtLeafCount(2)).toBe(2)
    expect(depthAtLeafCount(3)).toBe(3)
    expect(depthAtLeafCount(4)).toBe(3)
    expect(depthAtLeafCount(5)).toBe(4)
    expect(depthAtLeafCount(6)).toBe(4)
    expect(depthAtLeafCount(7)).toBe(4)
    expect(depthAtLeafCount(8)).toBe(4)
    expect(depthAtLeafCount(9)).toBe(5)
    expect(depthAtLeafCount(10)).toBe(5)
    expect(depthAtLeafCount(11)).toBe(5)
    expect(depthAtLeafCount(12)).toBe(5)
    expect(depthAtLeafCount(13)).toBe(5)
    expect(depthAtLeafCount(14)).toBe(5)
    expect(depthAtLeafCount(15)).toBe(5)
    expect(depthAtLeafCount(16)).toBe(5)
    expect(depthAtLeafCount(17)).toBe(6)
    expect(depthAtLeafCount(32)).toBe(6)
    expect(depthAtLeafCount(33)).toBe(7)
  })
})
