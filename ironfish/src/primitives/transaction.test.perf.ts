/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { useAccountFixture, useMinerBlockFixture } from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest, NodeTest } from '../testUtilities/nodeTest'
import { BigIntUtils, CurrencyUtils } from '../utils'
import { BenchUtils } from '../utils/bench'
import { Account } from '../wallet'
import { RawTransaction } from './rawTransaction'

type Results = { spends: number; outputs: number; elapsed: number }

describe('Transaction', () => {
  const nodeTest = createNodeTest()

  const TEST_AMOUNTS = [
    { spends: 1, outputs: 1 },
    { spends: 25, outputs: 1 },
    { spends: 50, outputs: 1 },
    { spends: 75, outputs: 1 },
    { spends: 100, outputs: 1 },
    { spends: 1, outputs: 25 },
    { spends: 1, outputs: 50 },
    { spends: 1, outputs: 75 },
    { spends: 1, outputs: 100 },
  ]

  it('post', async () => {
    const { wallet } = nodeTest
    const account2 = await useAccountFixture(nodeTest.node.wallet, 'account')

    const account = await useAccountFixture(wallet)

    // Generate enough notes for the tests
    for (let i = 0; i < Math.max(...TEST_AMOUNTS.map((t) => t.spends)); i++) {
      const block = await useMinerBlockFixture(
        nodeTest.chain,
        undefined,
        account,
        nodeTest.wallet,
      )
      await expect(nodeTest.chain).toAddBlock(block)
      await nodeTest.wallet.updateHead()
    }

    // Run tests
    for (const { spends, outputs } of TEST_AMOUNTS) {
      const results = await runTest(nodeTest, account, spends, outputs)
      printResults(results)
    }
  })

  function printResults(results: Results) {
    console.log(
      `[TEST RESULTS: Spends: ${results.spends}, Outputs: ${results.outputs}]` +
        `\nElapsed: ${results.elapsed.toLocaleString()} milliseconds`,
    )
  }

  async function runTest(
    nodeTest: NodeTest,
    account: Account,
    numSpends: number,
    numOutputs: number,
  ): Promise<Results> {
    const rawTx = await createTransaction(account, numSpends, numOutputs)

    Assert.isNotNull(account.spendingKey)

    const posted = rawTx.post(account.spendingKey)

    const block = await useMinerBlockFixture(
      nodeTest.node.chain,
      2,
      account,
      nodeTest.node.wallet,
    )
    nodeTest.node.memPool.acceptTransaction(posted)
    const start = BenchUtils.start()
    await nodeTest.node.miningManager.createNewBlockTemplate(block)
    const elapsed = BenchUtils.end(start)

    return { spends: numSpends, outputs: numOutputs, elapsed }
  }

  function createTransaction(
    account: Account,
    numSpends: number,
    numOutputs: number,
  ): Promise<RawTransaction> {
    const spendAmount = BigInt(numSpends) * CurrencyUtils.decodeIron(1)
    const outputAmount = Math.floor(BigIntUtils.divide(spendAmount, BigInt(numOutputs)))

    const outputs: { publicAddress: string; amount: bigint; memo: string; assetId: Buffer }[] =
      []
    for (let i = 0; i < numOutputs; i++) {
      outputs.push({
        publicAddress: account.publicAddress,
        amount: BigInt(outputAmount),
        memo: '',
        assetId: Asset.nativeId(),
      })
    }
    // deal with leftover change
    outputs.push({
      publicAddress: account.publicAddress,
      amount: spendAmount - BigInt(outputAmount) * BigInt(numOutputs),
      memo: '',
      assetId: Asset.nativeId(),
    })

    return createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      amount: spendAmount,
      outputs,
    })
  }
})

// To re-run: yarn test transaction.test.perf.ts --testPathIgnorePatterns

// 2023-04-26 M1 Macbook Pro Results

// [TEST RESULTS: Spends: 1, Outputs: 1]
// Elapsed: 1,186.752 milliseconds

// [TEST RESULTS: Spends: 10, Outputs: 1]
// Elapsed: 7,944.69 milliseconds

// [TEST RESULTS: Spends: 100, Outputs: 1]
// Elapsed: 76,534.142 milliseconds

// [TEST RESULTS: Spends: 1, Outputs: 10]
// Elapsed: 4,251.144 milliseconds

// [TEST RESULTS: Spends: 1, Outputs: 100]
// Elapsed: 35,963.016 milliseconds
