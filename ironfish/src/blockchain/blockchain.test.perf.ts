/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'
import { IronfishBlock } from '../primitives/block'
import _ from 'lodash'
import { MathUtils, UnwrapPromise } from '../utils'
import { Assert } from '../assert'

describe('Blockchain', () => {
  const nodeTest = createNodeTest()

  it('Add Block with fork', async () => {
    const { node: nodeA } = await nodeTest.createSetup()
    const { node: nodeB } = await nodeTest.createSetup()
    await Promise.all([nodeA.seed(), nodeB.seed()])

    const accountA = await useAccountFixture(nodeA.accounts, 'accountA')
    const accountB = await useAccountFixture(nodeB.accounts, 'accountB')

    const blocksA = new Array<IronfishBlock>()
    const blocksB = new Array<IronfishBlock>()

    // Create 100 blocks each on nodeA and nodeB
    for (let i = 0; i < 100; ++i) {
      console.log(`Creating Blocks ${i}`)

      const blockA = await useMinerBlockFixture(nodeA.chain, 2, accountA)
      const blockB = await useMinerBlockFixture(nodeB.chain, 2, accountB)

      await Promise.all([nodeA.chain.addBlock(blockA), nodeB.chain.addBlock(blockB)])

      blocksA.push(blockA)
      blocksB.push(blockB)
    }

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
        await node.seed()

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
// Total Test Average: 36.80ms
// Insert 0 blocks linear: 0.00ms
// Insert 0 blocks on fork: 0.00ms
// Add head rewind fork blocks: 36.80ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 3]
// Total Test Average: 228.40ms
// Insert 2 blocks linear: 35.00ms
// Insert 2 blocks on fork: 27.10ms
// Add head rewind fork blocks: 104.20ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 5]
// Total Test Average: 365.40ms
// Insert 4 blocks linear: 36.50ms
// Insert 4 blocks on fork: 47.10ms
// Add head rewind fork blocks: 31.00ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 10]
// Total Test Average: 711.20ms
// Insert 9 blocks linear: 35.36ms
// Insert 9 blocks on fork: 25.91ms
// Add head rewind fork blocks: 159.80ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 50]
// Total Test Average: 3651.00ms
// Insert 49 blocks linear: 36.48ms
// Insert 49 blocks on fork: 27.10ms
// Add head rewind fork blocks: 535.60ms

// [TEST RESULTS: Times Ran: 5, Fork Length: 100]
// Total Test Average: 7323.20ms
// Insert 99 blocks linear: 36.58ms
// Insert 99 blocks on fork: 27.19ms
// Add head rewind fork blocks: 1009.60ms
