/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { useAccountFixture, useMinerBlockFixture } from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest } from '../testUtilities/nodeTest'
import { BigIntUtils, CurrencyUtils } from '../utils'
import { BenchUtils } from '../utils/bench'
import { Account } from '../wallet'
import { RawTransaction } from './rawTransaction'

type Results = { spends: number; outputs: number; elapsed: number }

describe('Transaction', () => {
  const nodeTest = createNodeTest()

  const TEST_AMOUNTS = [
    { spends: 1, outputs: 1 },
    { spends: 10, outputs: 1 },
    { spends: 100, outputs: 1 },
    { spends: 1, outputs: 10 },
    { spends: 1, outputs: 100 },
  ]

  it('post', async () => {
    const { chain, wallet } = nodeTest

    const account = await useAccountFixture(wallet)

    // Generate enough notes for the tests
    for (let i = 0; i < Math.max(...TEST_AMOUNTS.map((t) => t.spends)); i++) {
      const block = await useMinerBlockFixture(chain, undefined, account, wallet)
      await expect(chain).toAddBlock(block)
      await wallet.updateHead()
    }

    // Run tests
    for (const { spends, outputs } of TEST_AMOUNTS) {
      const results = await runTest(account, spends, outputs)
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
    account: Account,
    numSpends: number,
    numOutputs: number,
  ): Promise<Results> {
    const rawTx = await createTransaction(account, numSpends, numOutputs)

    Assert.isNotNull(account.spendingKey)

    const start = BenchUtils.start()
    const posted = rawTx.post(account.spendingKey)
    const elapsed = BenchUtils.end(start)

    expect(posted.spends.length).toEqual(numSpends)
    expect(posted.notes.length).toEqual(numOutputs)

    return { spends: numSpends, outputs: numOutputs, elapsed }
  }

  function createTransaction(
    account: Account,
    numSpends: number,
    numOutputs: number,
  ): Promise<RawTransaction> {
    const spendAmount = BigInt(numSpends) * CurrencyUtils.decodeIron(20)
    const outputAmount = BigIntUtils.divide(spendAmount, BigInt(numOutputs))

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
