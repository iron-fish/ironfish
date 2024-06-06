/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { writeTestReport } from '../testUtilities'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
} from '../testUtilities/fixtures'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { createNodeTest } from '../testUtilities/nodeTest'
import { BigIntUtils, CurrencyUtils } from '../utils'
import { BenchUtils } from '../utils/bench'
import { Account, Wallet } from '../wallet'
import { WorkerPool } from '../workerPool'
import { BurnDescription } from './burnDescription'
import { MintData } from './rawTransaction'
import { Transaction } from './transaction'

type Results = {
  spends: number
  outputs: number
  mints: number
  burns: number
  elapsed: number
}

describe('Verify Transaction', () => {
  const nodeTest = createNodeTest(true)
  const TEST_AMOUNTS = [
    { spends: 1, outputs: 1, mints: 1, burns: 1 },
    { spends: 10, outputs: 1, mints: 1, burns: 1 },
    { spends: 100, outputs: 1, mints: 1, burns: 1 },
    { spends: 1, outputs: 10, mints: 1, burns: 1 },
    { spends: 1, outputs: 100, mints: 1, burns: 1 },
    { spends: 1, outputs: 1, mints: 10, burns: 1 },
    { spends: 1, outputs: 1, mints: 100, burns: 1 },
    { spends: 1, outputs: 1, mints: 1, burns: 10 },
    { spends: 1, outputs: 1, mints: 1, burns: 100 },
  ]

  let account: Account
  let wallet: Wallet
  let asset: Asset
  let workerPool: WorkerPool

  beforeAll(async () => {
    const { node } = await nodeTest.createSetup()

    account = await useAccountFixture(node.wallet, 'test')
    wallet = node.wallet
    workerPool = node.workerPool

    // Generate enough notes for the tests
    for (let i = 0; i < Math.max(...TEST_AMOUNTS.map((t) => t.spends)); i++) {
      const block = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
      await node.chain.addBlock(block)
      await node.wallet.scan()
    }

    // Generate asset for the tests
    asset = new Asset(account.publicAddress, 'test', '')
    const block = await useMintBlockFixture({
      node,
      account,
      asset,
      value: BigInt(Math.max(...TEST_AMOUNTS.map((t) => t.burns))),
    })
    await node.chain.addBlock(block)
    await node.wallet.scan()
  })

  for (const input of TEST_AMOUNTS) {
    it(`test spends ${input.spends} outputs ${input.outputs} mints ${input.mints} burns ${input.burns}`, async () => {
      const results = await runTest(
        account,
        input.spends,
        input.outputs,
        input.mints,
        input.burns,
      )
      expect(results).toBeDefined()
      printResults(results)
    })
  }

  function printResults(results: Results) {
    writeTestReport(
      new Map([['elapsed', `${results.elapsed}`]]),
      new Map([['Elapsed', `${results.elapsed.toLocaleString()} milliseconds`]]),
      `Spends: ${results.spends}, Outputs: ${results.outputs}, Mints: ${results.mints}, Burns: ${results.burns}`,
    )
  }

  async function runTest(
    account: Account,
    numSpends: number,
    numOutputs: number,
    numMints: number,
    numBurns: number,
  ): Promise<Results> {
    const tx = await createPostedTransaction(account, numSpends, numOutputs, numMints, numBurns)

    const start = BenchUtils.start()
    const verifyResult = await workerPool.verifyTransactions([tx])
    const elapsed = BenchUtils.end(start)

    expect(verifyResult).toBeTruthy()

    return { spends: numSpends, outputs: numOutputs, mints: numMints, burns: numBurns, elapsed }
  }

  async function createPostedTransaction(
    account: Account,
    numSpends: number,
    numOutputs: number,
    numMints: number,
    numBurns: number,
  ): Promise<Transaction> {
    const spendAmount = BigInt(numSpends) * CurrencyUtils.decodeIron(20)
    const outputAmount = BigIntUtils.divide(spendAmount, BigInt(numOutputs))

    const outputs: { publicAddress: string; amount: bigint; memo: Buffer; assetId: Buffer }[] =
      []
    for (let i = 0; i < numOutputs; i++) {
      outputs.push({
        publicAddress: account.publicAddress,
        amount: BigInt(outputAmount),
        memo: Buffer.from(''),
        assetId: Asset.nativeId(),
      })
    }

    const mints: MintData[] = []
    for (let i = 0; i < numMints; i++) {
      mints.push({
        creator: account.publicAddress,
        name: asset.name().toString('utf8'),
        metadata: asset.metadata().toString('utf8'),
        value: 2n,
      })
    }

    const burns: BurnDescription[] = []
    for (let i = 0; i < numBurns; i++) {
      burns.push({
        assetId: asset.id(),
        value: 1n,
      })
    }

    const rawTx = await createRawTransaction({
      wallet: wallet,
      from: account,
      amount: spendAmount,
      outputs,
      mints,
      burns,
    })

    Assert.isNotNull(account.spendingKey)
    const posted = rawTx.post(account.spendingKey)

    return new Transaction(posted.serialize())
  }
})
