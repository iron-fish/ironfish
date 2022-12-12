/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  it('produces unique transaction hashes', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

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

    const hashA = transactionA.unsignedHash()
    const hashB = transactionB.unsignedHash()

    expect(hashA.equals(hashB)).toBe(false)
  })

  it('check if a transaction is a miners fee', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

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

    expect(transactionA.isMinersFee()).toBe(true)
    expect(transactionB.isMinersFee()).toBe(true)
  })

  it('throw error if account is not fully synced when creating transaction', async () => {
    const nodeA = nodeTest.node

    // Create an account A
    const accountA = await useAccountFixture(nodeA.wallet, 'testA')
    const accountB = await useAccountFixture(nodeA.wallet, 'testB')

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.wallet.updateHead()
    const headhash = await nodeA.wallet.getLatestHeadHash()
    Assert.isNotNull(headhash)
    // Modify the headhash
    headhash[0] = 0
    await nodeA.wallet.updateHeadHash(accountA, headhash)

    const response = nodeA.wallet.createTransaction(
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
    await expect(response).rejects.toThrowError(Error)
  })

  it('check if a transaction is not a miners fee', async () => {
    const nodeA = nodeTest.node

    // Create an account A
    const accountA = await useAccountFixture(nodeA.wallet, () =>
      nodeA.wallet.createAccount('testA'),
    )
    const accountB = await useAccountFixture(nodeA.wallet, () =>
      nodeA.wallet.createAccount('testB'),
    )

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.wallet.updateHead()

    const transaction = await nodeA.wallet.createTransaction(
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
    expect(transaction.isMinersFee()).toBe(false)
    // TODO(joe): replace with accountA.publicAddress
    expect(transaction.sender()).toBe(
      '8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c563',
    )
  }, 500000)
})
