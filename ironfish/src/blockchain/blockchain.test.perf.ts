/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import _ from 'lodash'
import { Assert } from '../assert'
import { Block } from '../primitives'
import {
  createNodeTest,
  useAccountFixture,
  useBlockWithTx,
  useMinerBlockFixture,
} from '../testUtilities'
import { MathUtils, UnwrapPromise } from '../utils'

describe('Blockchain', () => {
  const nodeTest = createNodeTest()

  it('Add Block with fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()

    const accountA = await useAccountFixture(nodeA.accounts, 'accountA')
    const accountB = await useAccountFixture(nodeB.accounts, 'accountB')

    const blocksA = new Array<Block>()
    const blocksB = new Array<Block>()

    // Create 100 blocks each on nodeA and nodeB
    for (let i = 0; i < 100; ++i) {
      console.log(`Creating Blocks ${i}`)

      let blockA: Block
      let blockB: Block

      if (i === 0) {
        blockA = await useMinerBlockFixture(nodeA.chain, undefined, accountA, nodeA.accounts)
        blockB = await useMinerBlockFixture(nodeB.chain, undefined, accountB, nodeB.accounts)
      } else {
        const { block: bA } = await useBlockWithTx(nodeA, accountA, accountA, false)
        const { block: bB } = await useBlockWithTx(nodeB, accountB, accountB, false)

        blockA = bA
        blockB = bB
      }

      await Promise.all([
        expect(nodeA.chain).toAddBlock(blockA),
        expect(nodeB.chain).toAddBlock(blockB),
      ])

      await Promise.all([nodeA.accounts.updateHead(), nodeB.accounts.updateHead()])

      blocksA.push(blockA)
      blocksB.push(blockB)
    }

    const balanceA = await nodeA.accounts.getBalance(accountA)
    const balanceB = await nodeB.accounts.getBalance(accountB)

    // You'll need to update this if the block reward changes
    expect(balanceA.confirmed).toEqual(BigInt(1999999901))
    expect(balanceA.unconfirmed).toEqual(BigInt(1999999901))
    expect(balanceB.confirmed).toEqual(BigInt(1999999901))
    expect(balanceB.unconfirmed).toEqual(BigInt(1999999901))

    async function runTest(
      testCount: number,
      forkLength: number,
    ): Promise<{
      testCount: number
      forkLength: number
      all: number[]
      add: number[]
      fork: number[]
      rewind: number[]
    }> {
      forkLength = Math.min(Math.min(forkLength, blocksA.length), blocksB.length)

      const samplesAll = []
      const samplesAdd = []
      const samplesFork = []
      const samplesRewind = []

      for (let i = 0; i < testCount; i++) {
        console.log(`Running Test ${i}`)

        const { node } = await nodeTest.createSetup()

        const startAll = Date.now()

        // Add 99 blocks from blocksA
        for (let i = 0; i < forkLength - 1; ++i) {
          const startAdd = Date.now()
          await node.chain.addBlock(blocksA[i])
          const endAdd = Date.now()
          samplesAdd.push(endAdd - startAdd)
        }

        // Add 99 blocks from blocksB
        for (let i = 0; i < forkLength - 1; ++i) {
          const startFork = Date.now()
          await node.chain.addBlock(blocksB[i])
          const endFork = Date.now()
          samplesFork.push(endFork - startFork)
        }

        // Now add the new heaviest block from blockB which causes
        // the blocks from blocksB to be removed from the trees
        const startRewind = Date.now()
        await node.chain.addBlock(blocksB[forkLength - 1])
        const endRewind = Date.now()
        samplesRewind.push(endRewind - startRewind)

        const endAll = Date.now()
        samplesAll.push(endAll - startAll)

        // Verify the head is the last block in blocksB
        const actualHead = node.chain.head
        const expectedHead = blocksB[forkLength - 1]
        Assert.isNotNull(actualHead, 'Chain has no head')
        expect(actualHead.hash.toString('hex')).toEqual(
          expectedHead.header.hash.toString('hex'),
        )
      }

      return {
        testCount,
        forkLength,
        all: samplesAll,
        add: samplesAdd,
        rewind: samplesRewind,
        fork: samplesFork,
      }
    }

    function printResults(result: UnwrapPromise<ReturnType<typeof runTest>>): void {
      console.log(
        `[TEST RESULTS: Times Ran: ${result.testCount}, Fork Length: ${result.forkLength}]` +
          `\nTotal Test Average: ${MathUtils.arrayAverage(result.all).toFixed(2)}ms` +
          `\nInsert ${result.forkLength - 1} blocks linear: ${MathUtils.arrayAverage(
            result.add,
          ).toFixed(2)}ms` +
          `\nInsert ${result.forkLength - 1} blocks on fork: ${MathUtils.arrayAverage(
            result.fork,
          ).toFixed(2)}ms` +
          `\nAdd head rewind fork blocks: ${MathUtils.arrayAverage(result.rewind).toFixed(
            2,
          )}ms`,
      )
    }

    printResults(await runTest(5, 1))
    printResults(await runTest(5, 3))
    printResults(await runTest(5, 5))
    printResults(await runTest(5, 10))
    printResults(await runTest(5, 50))
    printResults(await runTest(5, 100))
  }, 780000)
})

// Last results on Jason Spafford's Machine
// If you decide to change addBlock() consider
// running these tests and updating the results
// here: yarn test test.perf.ts --testPathIgnorePatterns

// [TEST RESULTS: Times Ran: 5, Fork Length: 1]
// Total Test Average: 15.60ms
// Insert 0 blocks linear: 0.00ms
// Insert 0 blocks on fork: 0.00ms
// Add head rewind fork blocks: 15.60ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 3]
// Total Test Average: 274.60ms
// Insert 2 blocks linear: 38.20ms
// Insert 2 blocks on fork: 20.20ms
// Add head rewind fork blocks: 157.80ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 5]
// Total Test Average: 612.20ms
// Insert 4 blocks linear: 57.30ms
// Insert 4 blocks on fork: 75.10ms
// Add head rewind fork blocks: 82.60ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 10]
// Total Test Average: 1598.80ms
// Insert 9 blocks linear: 67.49ms
// Insert 9 blocks on fork: 99.64ms
// Add head rewind fork blocks: 94.60ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 50]
// Total Test Average: 13709.40ms
// Insert 49 blocks linear: 74.29ms
// Insert 49 blocks on fork: 201.62ms
// Add head rewind fork blocks: 189.00ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 100]
// Total Test Average: 43504.20ms
// Insert 99 blocks linear: 84.23ms
// Insert 99 blocks on fork: 351.67ms
// Add head rewind fork blocks: 349.20ms
