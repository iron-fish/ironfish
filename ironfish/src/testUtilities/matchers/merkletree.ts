/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import diff from 'jest-diff'
import { MerkleTree, Witness, WitnessSide } from '../../merkletree'
import { NodeValue } from '../../merkletree/schema'
import { makeError } from './utils'

declare global {
  namespace jest {
    interface Matchers<R> {
      toHaveLeaves(characters: string, parents: number[]): Promise<R>
      toHaveNodes(nodeSpecs: [number, WitnessSide, number, string][]): Promise<R>
      toMatchTree(other: MerkleTree<string, string, string, string>): Promise<R>
      toMatchWitness(treeSize: number, rootHash: string, authPath: [WitnessSide, string][]): R
    }
  }
}

expect.extend({
  async toHaveLeaves(
    tree: MerkleTree<string, string, string, string>,
    characters: string,
    parents: number[],
  ): Promise<jest.CustomMatcherResult> {
    let error: string | null = null
    const treeSize = await tree.size()

    if (characters.length !== parents.length) {
      error = `expected characters to have same length as parents`
    } else if (treeSize !== characters.length) {
      error = `expected tree size ${treeSize} to be ${characters.length}`
    }

    for (let i = 0; i < characters.length; i++) {
      if (error !== null) {
        break
      }

      const leaf = await tree.getLeaf(i)

      if (leaf.element !== characters[i]) {
        error = `expected element ${i} to be ${characters[i]}, but it is ${leaf.element}`
      } else if (leaf.merkleHash !== characters[i]) {
        error = `expected element ${i} to have hash ${characters[i]}, but it is ${leaf.merkleHash}`
      } else if (leaf.parentIndex !== parents[i]) {
        error = `expected element ${i} to have parent ${parents[i]}, but it is ${leaf.parentIndex}`
      }
    }
    return makeError(
      error,
      `expected tree not to match ${characters} and ${parents.toString()}`,
    )
  },
  async toHaveNodes(
    tree: MerkleTree<string, string, string, string>,
    nodeSpecs: [number, WitnessSide, number, string][],
  ): Promise<jest.CustomMatcherResult> {
    let error: string | null = null

    const treeNodes = await tree.nodes.getAllValues()
    const treeNodeCount = treeNodes.length
    const nodeCounter = await tree.getCount('Nodes')

    if (treeNodeCount !== nodeSpecs.length) {
      error = `expected tree to have ${nodeSpecs.length} nodes, got ${treeNodeCount}`
    } else if (nodeCounter !== nodeSpecs.length + 1) {
      error = `expected Node counter to be ${nodeSpecs.length + 1} but it is ${nodeCounter}`
    }

    for (const nodeSpec of nodeSpecs) {
      const [index, side, otherIndex, hashOfSibling] = nodeSpec

      if (error !== null) {
        break
      }

      // Sorry; this is a bit convoluted; I'm trying to make the tests as readable as possible.
      // it's just building a list of elements
      const nodeValue: NodeValue<string> = {
        side,
        hashOfSibling,
        leftIndex: otherIndex,
        parentIndex: otherIndex,
        index,
      }

      let expected
      if (side === WitnessSide.Left) {
        const { leftIndex: _leftIndex, ...expectedValue } = nodeValue
        expected = expectedValue
      } else {
        const { parentIndex: _parentIndex, ...expectedValue } = nodeValue
        expected = expectedValue
      }

      const node = await tree.getNode(index)
      const diffString = diff(expected, node)

      if (diffString && diffString.includes('Expected')) {
        error = `node ${index} didn't match: \n\nDifference:\n\n${diffString}`
      }
    }

    return makeError(error, 'tree should not match given nodes')
  },
  async toMatchTree(
    tree: MerkleTree<string, string, string, string>,
    other: MerkleTree<string, string, string, string>,
  ): Promise<jest.CustomMatcherResult> {
    let error: string | null = null
    const treeLeafCount = await tree.getCount('Leaves')
    const treeNodeCount = await tree.getCount('Nodes')
    const otherLeafCount = await other.getCount('Leaves')
    const otherNodeCount = await other.getCount('Nodes')

    if (treeLeafCount !== otherLeafCount) {
      error = `tree ${tree.name} has ${treeLeafCount} leaves, but expected ${otherLeafCount}`
    } else if (treeNodeCount !== otherNodeCount) {
      error = `tree ${tree.name} has ${treeNodeCount} nodes, but expected ${otherNodeCount}`
    }

    for (let index = 0; index < treeLeafCount; index++) {
      if (error !== null) {
        break
      }

      const { ...actualLeaf } = await tree.getLeaf(index)
      const { ...expectedLeaf } = await other.getLeaf(index)

      const diffString = diff(actualLeaf, expectedLeaf)
      if (diffString && diffString.includes('Expected')) {
        error = `leaf ${index} didn't match: \n\n Difference: \n\n${diffString}`
      }
    }

    for (let index = 1; index < treeNodeCount; index++) {
      if (error !== null) {
        break
      }
      const { ...expectedNode } = await tree.getNode(index)
      const { ...actualNode } = await other.getNode(index)

      const diffString = diff(actualNode, expectedNode)
      if (diffString && diffString.includes('Expected')) {
        error = `node ${index} didn't match: \n\n Difference: \n\n${diffString}`
      }
    }

    return makeError(error, 'trees should not match')
  },
  toMatchWitness(
    witness: Witness<string, string, string, string>,
    treeSize: number,
    rootHash: string,
    authenticationPath: [WitnessSide, string][],
  ): jest.CustomMatcherResult {
    let error: string | null = null

    if (witness === undefined) {
      error = 'expected witness to be defined'
    } else if (witness.rootHash !== rootHash) {
      error = `Witness has incorrect root hash:\n\n${
        diff(rootHash, witness.rootHash) || 'null'
      }`
    } else if (witness.treeSize() !== treeSize) {
      error = `Witness has incorrect tree size ${witness.treeSize()}, expected ${treeSize}`
    } else if (witness.authenticationPath.length !== authenticationPath.length) {
      error = `Witness has incorrect authentication path length ${witness.authenticationPath.length}, expected ${authenticationPath.length}`
    }

    for (let index = 0; index < authenticationPath.length; index++) {
      if (error !== null) {
        break
      }
      const actual = witness.authenticationPath[index]
      const expected = authenticationPath[index]

      if (actual.side !== expected[0]) {
        error = `Witness path index ${index} has side ${actual.side}, but expected ${expected[0]}`
      } else if (actual.hashOfSibling !== expected[1]) {
        error = `Witness path index ${index} has incorrect sibling hash:\n\n${
          diff(actual.hashOfSibling, expected[1]) || 'null'
        }`
      }
    }

    return makeError(error, 'witnesses should not match')
  },
})
