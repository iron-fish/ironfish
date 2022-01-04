/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  it('produces unique transaction hashes', async () => {
    const account = await useAccountFixture(nodeTest.accounts)

    const transactionA = await nodeTest.strategy.createMinersFee(
      BigInt(0),
      1,
      account.spendingKey,
    )

    const transactionB = await nodeTest.strategy.createMinersFee(
      BigInt(0),
      1,
      account.spendingKey,
    )

    const hashA = transactionA.hash()
    const hashB = transactionB.hash()

    expect(hashA.equals(hashB)).toBe(false)
  }, 600000)

  it('check if a transaction is a miners fee', async () => {
    const account = await useAccountFixture(nodeTest.accounts)

    const transactionA = await nodeTest.strategy.createMinersFee(
      BigInt(0),
      1,
      account.spendingKey,
    )

    const transactionB = await nodeTest.strategy.createMinersFee(
      BigInt(-1),
      1,
      account.spendingKey,
    )

    expect(await transactionA.isMinersFee()).toBe(true)
    expect(await transactionB.isMinersFee()).toBe(true)
  })

  it('check if a transaction is not a miners fee', async () => {
    const nodeA = nodeTest.node

    // Create an account A
    const accountA = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testA'),
    )
    const accountB = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testB'),
    )

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.accounts.updateHead()

    const transaction = await nodeA.accounts.createTransaction(
      accountA,
      [
        {
          publicAddress: accountB.publicAddress,
          amount: BigInt(1),
          memo: '',
        },
      ],
      BigInt(1),
      0,
    )
    expect(await transaction.isMinersFee()).toBe(false)
  }, 600000)
})
