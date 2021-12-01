/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from 'ironfish-rust-nodejs'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../testUtilities'
import { AsyncUtils } from '../utils'

describe('Mining director', () => {
  const nodeTest = createNodeTest()

  it('should not add conflicting transactions', async () => {
    const node = nodeTest.node
    const { chain, accounts, memPool, miningDirector } = node

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
    transactions = await AsyncUtils.materialize(miningDirector['getTransactions']())
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
    transactions = await AsyncUtils.materialize(miningDirector['getTransactions']())
    expect(transactions).toHaveLength(0)
  })
})
