/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable no-console */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { Block, Transaction } from '../primitives'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'
import { createRawTransaction } from '../testUtilities/helpers/transaction'
import { BenchUtils } from '../utils'
import { Account, Wallet, SpendingAccount } from '../wallet'

type Results = { mempoolSize: number; numTransactions: number; elapsed: number }

describe('MiningManager', () => {
  const nodeTest = createNodeTest()
  let account: Account
  const transactions: Transaction[] = []
  const blocks: Block[] = []

  const TEST_AMOUNTS = [
    { mempoolSize: 0 },
    { mempoolSize: 1 },
    { mempoolSize: 10 },
    { mempoolSize: 50 },
    { mempoolSize: 100 },
  ]

  beforeAll(async () => {
    // Initialize the setup node
    const { node } = await nodeTest.createSetup()
    account = await useAccountFixture(node.wallet)

    // Block 1: Initial funds for split
    const block1 = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)

    await node.chain.addBlock(block1)
    await node.wallet.updateHead()
    blocks.push(block1)

    // Split enough notes to create the transactions we need
    const transactionAmount = Math.max(...TEST_AMOUNTS.map((t) => t.mempoolSize))
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
    await node.wallet.updateHead()
    blocks.push(block2)

    for (let i = 0; i < transactionAmount; i++) {
      const tx = await useTxFixture(node.wallet, account, account, undefined, 0n)
      transactions.push(tx)
    }

    Assert.isEqual(transactions.length, transactionAmount)
  })

  for (const testInput of TEST_AMOUNTS) {
    it(`Mempool size: ${testInput.mempoolSize}`, async () => {
      const results = await runTest(account, blocks, transactions, testInput.mempoolSize)
      printResults(results)

      expect(results).toBeDefined()
    })
  }

  function printResults(results: Results) {
    console.log(
      `[TEST RESULTS: Mempool size: ${results.mempoolSize}, Transactions count: ${results.numTransactions}]` +
        `\nElapsed: ${results.elapsed.toLocaleString()} milliseconds`,
    )
  }

  async function runTest(
    account: SpendingAccount,
    blocks: Block[],
    transactions: Transaction[],
    mempoolSize: number,
  ): Promise<Results> {
    // Initialize a fresh node to get a fresh mempool and re-import the
    // necessary stuff
    const { chain, node, wallet } = await nodeTest.createSetup()
    await wallet.importAccount(account)
    await wallet.setDefaultAccount(account.name)
    for (const block of blocks) {
      await expect(chain).toAddBlock(block)
    }
    await wallet.updateHead()

    // Add appropriate number of transactions to the mempool
    for (let i = 0; i < mempoolSize; i++) {
      expect(node.memPool.acceptTransaction(transactions[i])).toEqual(true)
    }

    expect(node.memPool.count()).toEqual(mempoolSize)

    const start = BenchUtils.start()
    const blockTemplate = await node.miningManager.createNewBlockTemplate(
      blocks[blocks.length - 1],
      account,
    )
    const elapsed = BenchUtils.end(start)

    expect(blockTemplate.transactions.length).toEqual(mempoolSize + 1)

    return { mempoolSize, numTransactions: blockTemplate.transactions.length, elapsed }
  }

  async function splitNotes(
    account: Account,
    numOutputs: number,
    wallet: Wallet,
  ): Promise<Transaction> {
    const outputs: { publicAddress: string; amount: bigint; memo: string; assetId: Buffer }[] =
      []
    for (let i = 0; i < numOutputs; i++) {
      outputs.push({
        publicAddress: account.publicAddress,
        amount: BigInt(1),
        memo: '',
        assetId: Asset.nativeId(),
      })
    }

    const transaction = await createRawTransaction({
      wallet: wallet,
      from: account,
      amount: BigInt(outputs.length),
      outputs,
    })

    Assert.isNotNull(account.spendingKey)
    return transaction.post(account.spendingKey)
  }
})

// To re-run: yarn test manager.test.perf.ts --testPathIgnorePatterns

// 2023-05-10 M1 Macbook Pro Results

// [TEST RESULTS: Mempool size: 0, Transactions count: 1]
// Elapsed: 456.541 milliseconds

// [TEST RESULTS: Mempool size: 1, Transactions count: 2]
// Elapsed: 379.276 milliseconds

// [TEST RESULTS: Mempool size: 10, Transactions count: 11]
// Elapsed: 471.182 milliseconds

// [TEST RESULTS: Mempool size: 50, Transactions count: 51]
// Elapsed: 598.714 milliseconds

// [TEST RESULTS: Mempool size: 100, Transactions count: 101]
// Elapsed: 812.24 milliseconds
