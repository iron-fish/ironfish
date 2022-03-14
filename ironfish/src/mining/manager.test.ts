/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'

describe('Mining manager', () => {
  const nodeTest = createNodeTest()

  it('should not add conflicting transactions', async () => {
    const node = nodeTest.node
    const { chain, accounts, memPool, miningManager } = node

    const account = await useAccountFixture(accounts)

    // Give account some money
    const block = await useMinerBlockFixture(chain, 2, account, accounts)
    await expect(chain).toAddBlock(block)
    await node.accounts.updateHead()

    // Create 2 transactions that spend the same note
    const transactionA = await useTxFixture(accounts, account, account, undefined, BigInt(0))
    await accounts.removeTransaction(transactionA)
    const transactionB = await useTxFixture(accounts, account, account, undefined, BigInt(1))

    const spendsA = Array.from(transactionA.spends())
    const spendsB = Array.from(transactionB.spends())

    // Both transactions should spend the same thing
    expect(spendsA[0].nullifier.toString('hex')).toEqual(spendsB[0].nullifier.toString('hex'))
    expect(spendsA.length).toEqual(1)
    expect(spendsB.length).toEqual(1)
    expect(transactionA.hash().toString('hex')).not.toEqual(transactionB.hash().toString('hex'))

    await memPool.acceptTransaction(transactionA)
    await memPool.acceptTransaction(transactionB)
    expect(memPool.size()).toEqual(2)

    // Should have both because our mempool returns conflicting transactions
    let transactions = Array.from(memPool.get())
    expect(transactions).toHaveLength(2)
    expect(transactions).toEqual([transactionB, transactionA])

    // Should only have transactionB
    transactions = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1))
      .blockTransactions
    expect(transactions).toHaveLength(1)
    expect(transactions).toEqual([transactionB])

    // Now add block with transactionA to the chain
    const blockA = await chain.newBlock(
      [transactionA],
      await node.strategy.createMinersFee(
        BigInt(0),
        chain.head.sequence + 1,
        generateKey().spending_key,
      ),
    )
    await expect(chain).toAddBlock(blockA)
    await expect(chain.nullifiers.contains(spendsA[0].nullifier)).resolves.toBe(true)

    // Need to add these back in because addblock will remove them
    await memPool.acceptTransaction(transactionA)
    await memPool.acceptTransaction(transactionB)
    expect(memPool.size()).toEqual(2)

    // Should no longer try to add transactionB since transactionA is already in the chain
    transactions = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1))
      .blockTransactions
    expect(transactions).toHaveLength(0)
  }, 10000)

  it('should not add expired transaction to block', async () => {
    const { node, chain, accounts } = nodeTest
    const { miningManager } = nodeTest.node

    // Create an account with some money
    const account = await useAccountFixture(accounts)
    const block1 = await useMinerBlockFixture(chain, undefined, account, accounts)
    await expect(chain).toAddBlock(block1)
    await accounts.updateHead()

    const transaction = await useTxFixture(
      accounts,
      account,
      account,
      undefined,
      undefined,
      chain.head.sequence + 2,
    )

    jest.spyOn(node.memPool, 'get').mockImplementation(function* () {
      yield transaction
    })

    let results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1))
      .blockTransactions
    expect(results).toHaveLength(1)
    expect(results[0].hash().equals(transaction.hash())).toBe(true)

    // It shouldn't be returned after 1 more block is added
    const block2 = await useMinerBlockFixture(chain)
    await expect(chain).toAddBlock(block2)

    results = (await miningManager.getNewBlockTransactions(chain.head.sequence + 1))
      .blockTransactions
    expect(results).toHaveLength(0)
  }, 10000)
})
