/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ResponseError } from '../rpc'
import { ERROR_CODES } from '../rpc/adapters/errors'
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

    const hashA = transactionA.unsignedHash()
    const hashB = transactionB.unsignedHash()

    expect(hashA.equals(hashB)).toBe(false)
  })

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

    expect(transactionA.isMinersFee()).toBe(true)
    expect(transactionB.isMinersFee()).toBe(true)
  })

  it('throw error if account is not fully synced when creating transaction', async () => {
    const nodeA = nodeTest.node

    // Create an account A
    const accountA = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testA'),
    )
    const accountB = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testB'),
    )

    // Create a block with a miner's fee
    const block1 = await useMinerBlockFixture(
      nodeA.chain,
      2,
      accountA,
      Date.now() - 3 * (1000 * 60 * 60 * 24),
    )
    await nodeA.chain.addBlock(block1)
    await nodeA.accounts.updateHead()
    await nodeA.accounts.getLatestHeadHash()

    const response = nodeA.accounts.createTransaction(
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
    await expect(response).rejects.toThrowError(ResponseError)
    await expect(response).rejects.toMatchObject({
      status: 400,
      code: ERROR_CODES.ERROR,
      message: expect.stringContaining(
        'Your node must be synced with the Iron Fish network to send a transaction.',
      ),
    })
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
    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA, Date.now())
    await nodeA.chain.addBlock(block1)
    await nodeA.accounts.updateHead()
    await nodeA.accounts.getLatestHeadHash()

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
    expect(transaction.isMinersFee()).toBe(false)
  }, 500000)
})
