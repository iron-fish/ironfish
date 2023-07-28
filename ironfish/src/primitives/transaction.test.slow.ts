/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
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
    await accountA.updateHead({ hash: headhash, sequence: 2 })

    const response = nodeA.wallet.createTransaction({
      account: accountA,
      outputs: [
        {
          publicAddress: accountB.publicAddress,
          amount: BigInt(1),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: 1n,
      expiration: 0,
    })
    await expect(response).rejects.toThrow(Error)
  })

  it('check if a transaction is not a miners fee', async () => {
    const nodeA = nodeTest.node

    // Create an account A
    const accountA = await useAccountFixture(nodeTest.node.wallet, 'testA')
    const accountB = await useAccountFixture(nodeTest.node.wallet, 'testB')

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.wallet.updateHead()

    const raw = await nodeA.wallet.createTransaction({
      account: accountA,
      outputs: [
        {
          publicAddress: accountB.publicAddress,
          amount: BigInt(1),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: 1n,
      expiration: 0,
    })

    const { transaction } = await nodeA.wallet.post({
      transaction: raw,
      account: accountA,
    })

    expect(transaction.isMinersFee()).toBe(false)
  })
})
