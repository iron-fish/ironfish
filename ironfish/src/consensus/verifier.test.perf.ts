/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FullNode } from '../node'
import { Transaction } from '../primitives'
import { splitNotes, useAccountFixture, useTxFixture, writeTestReport } from '../testUtilities'
import { useMinerBlockFixture } from '../testUtilities/fixtures/blocks'
import { createNodeTest } from '../testUtilities/nodeTest'
import { BenchUtils } from '../utils/bench'
import { Account } from '../wallet'

describe('Verify Block', () => {
  const nodeTest = createNodeTest()
  const nodeArrays = new Array<FullNode>()
  const testCount = 5
  let account: Account
  const transactions: Transaction[] = []

  const TEST_AMOUNTS = [
    { numTransactions: 0 },
    { numTransactions: 1 },
    { numTransactions: 10 },
    { numTransactions: 50 },
    { numTransactions: 100 },
  ]

  beforeAll(async () => {
    // Initialize the setup node
    const { node } = await nodeTest.createSetup()
    account = await useAccountFixture(node.wallet)

    // Block 1: Initial funds for split
    const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)

    await node.chain.addBlock(block1)
    await node.wallet.scan()

    // Split enough notes to create the transactions we need
    const transactionAmount = Math.max(...TEST_AMOUNTS.map((t) => t.numTransactions))

    const transaction = await useTxFixture(
      node.wallet,
      account,
      account,
      async () => await splitNotes(account, transactionAmount, node.wallet),
    )

    // Block 2: Split notes for transactions
    const block2 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet, [
      transaction,
    ])

    await node.chain.addBlock(block2)
    await node.wallet.scan()

    for (let i = 0; i < transactionAmount; i++) {
      const tx = await useTxFixture(node.wallet, account, account, undefined, 0n)
      transactions.push(tx)
    }
  })

  beforeEach(async () => {
    // Create nodes for each test
    for (let i = 0; i < testCount; ++i) {
      const { node } = await nodeTest.createSetup()
      nodeArrays.push(node)
    }
  })

  for (const input of TEST_AMOUNTS) {
    it(`test run ${testCount} transaction count ${input.numTransactions}}`, async () => {
      const results = await runTest(input.numTransactions)
      expect(results).toBeDefined()
      printResults(results)
    })
  }

  afterEach(() => {
    nodeArrays.splice(0)
  })

  async function runTest(numTransactions: number): Promise<{
    numTransactions: number
    runs: number[]
  }> {
    const runs: number[] = []

    for (let i = 0; i < testCount; i++) {
      const node = nodeArrays[i]
      const block = await useMinerBlockFixture(
        node.chain,
        undefined,
        undefined,
        undefined,
        transactions.slice(0, numTransactions),
      )

      const start = BenchUtils.start()
      const verification = await nodeTest.chain.verifier.verifyBlock(block)
      runs.push(BenchUtils.end(start))

      expect(verification).toBeTruthy()
    }

    return { numTransactions, runs }
  }

  function printResults(results: { numTransactions: number; runs: number[] }) {
    let min = Number.MAX_SAFE_INTEGER
    let max = 0
    let total = 0
    for (const elapsed of results.runs) {
      min = Math.min(elapsed, min)
      max = Math.max(elapsed, max)
      total += elapsed
    }
    const average = total / results.runs.length

    writeTestReport(
      new Map([
        ['fastestruntime', `${min}`],
        ['slowestruntime', `${max}`],
        ['averageruntime', `${average}`],
      ]),
      new Map([
        ['Fastest runtime', `${min} milliseconds`],
        ['Slowest runtime', `${max} milliseconds`],
        ['Average runtime', `${average} milliseconds`],
      ]),
      `Times Ran: ${results.runs.length}, Transaction Count: ${results.numTransactions}`,
    )
  }
})
