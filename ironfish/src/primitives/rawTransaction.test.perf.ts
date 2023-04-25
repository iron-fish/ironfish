/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { useAccountFixture, useMinerBlockFixture } from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest, NodeTest } from '../testUtilities/nodeTest'
import { CurrencyUtils } from '../utils'
import { BenchUtils } from '../utils/bench'

describe('RawTransaction input creation performance benchmarking', () => {
  const nodeTest = createNodeTest()

  function printInputCountResults(millis: number, numInputs: number): void {
    console.log(
      `[TEST RESULTS: Number of transaction inputs: ${numInputs}, benchmark time in milliseconds: ${millis}]`,
    )
  }

  it('benchmarks 1-input txn creation', async () => {
    const inputCount = 1
    const resultMillis = await rawTransactionBenchmarkInputs(nodeTest, inputCount)
    expect(resultMillis).toBeGreaterThan(0)
    printInputCountResults(resultMillis, inputCount)
  })

  it('benchmarks 10-input txn creation', async () => {
    const inputCount = 10
    const resultMillis = await rawTransactionBenchmarkInputs(nodeTest, inputCount)
    expect(resultMillis).toBeGreaterThan(0)
    printInputCountResults(resultMillis, inputCount)
  })

  it('benchmarks 100-input txn creation', async () => {
    const inputCount = 100
    const resultMillis = await rawTransactionBenchmarkInputs(nodeTest, inputCount)
    expect(resultMillis).toBeGreaterThan(0)
    printInputCountResults(resultMillis, inputCount)
  })

  it('benchmarks 1000-input txn creation', async () => {
    const inputCount = 1000
    const resultMillis = await rawTransactionBenchmarkInputs(nodeTest, inputCount)
    expect(resultMillis).toBeGreaterThan(0)
    printInputCountResults(resultMillis, inputCount)
  })
})

async function rawTransactionBenchmarkInputs(
  nodeTest: NodeTest,
  inputCount: number,
): Promise<number> {
  const account = await useAccountFixture(nodeTest.wallet)

  let totalAmount = 0n
  const amountPerBlock = CurrencyUtils.decodeIron('20')
  for (let i = 0; i < inputCount; i++) {
    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.updateHead()
    totalAmount += amountPerBlock
  }

  const fee = 5n
  const raw = await createRawTransaction({
    wallet: nodeTest.wallet,
    from: account,
    to: account,
    amount: totalAmount - fee,
    fee: fee,
    expiration: inputCount + 2,
    burns: [],
    mints: [],
  })
  const start = BenchUtils.start()
  const posted = raw.post(account.spendingKey)
  const end = BenchUtils.end(start)
  expect(posted).toBeTruthy()
  return end
}
