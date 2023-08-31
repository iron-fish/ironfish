/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import {
  useAccountFixture,
  useMinerBlockFixture,
  usePostTxFixture,
  useTxSpendsFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AsyncUtils } from '../../../utils'
import { GetAccountTransactionsResponse } from './getAccountTransactions'

describe('Route wallet/getAccountTransactions', () => {
  const routeTest = createRouteTest(true)

  it('streams the associated transaction for a hash', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet)

    const block = await useMinerBlockFixture(routeTest.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(block)
    await node.wallet.updateHead()

    const response = routeTest.client.wallet.getAccountTransactionsStream({
      account: account.name,
      hash: block.transactions[0].hash().toString('hex'),
    })

    const transactions = await AsyncUtils.materialize(response.contentStream())
    expect(transactions).toHaveLength(1)
    expect(transactions[0].hash).toEqual(block.transactions[0].hash().toString('hex'))
  })

  it('throws a ValidationError for invalid sequences', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'invalid-sequence')

    const response = routeTest.client
      .request<unknown, GetAccountTransactionsResponse>('wallet/getAccountTransactions', {
        account: account.name,
        sequence: 0,
      })
      .waitForEnd()

    await expect(response).rejects.toMatchObject({
      status: 400,
    })
  })

  it('streams back transactions for a given block sequence', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'valid-sequence')

    const asset = new Asset(account.publicAddress, 'asset', 'metadata')
    const mint = await usePostTxFixture({
      node: node,
      wallet: node.wallet,
      from: account,
      mints: [
        {
          creator: asset.creator().toString('hex'),
          name: asset.name().toString('utf8'),
          metadata: asset.metadata().toString('utf8'),
          value: BigInt(10),
        },
      ],
    })

    const block = await useMinerBlockFixture(routeTest.chain, undefined, account, node.wallet, [
      mint,
    ])
    await expect(node.chain).toAddBlock(block)
    await node.wallet.updateHead()

    const response = routeTest.client.request<unknown, GetAccountTransactionsResponse>(
      'wallet/getAccountTransactions',
      {
        account: account.name,
        sequence: block.header.sequence,
      },
    )

    const blockTransactionHashes = block.transactions
      .map((transaction) => transaction.hash())
      .sort()
    const accountTransactions = await AsyncUtils.materialize(response.contentStream())
    const accountTransactionHashes = accountTransactions
      .map(({ hash }) => Buffer.from(hash, 'hex'))
      .sort()

    expect(accountTransactionHashes).toEqual(blockTransactionHashes)
  })

  it('streams back all transactions by default', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'default-stream')

    const blockA = await useMinerBlockFixture(routeTest.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(blockA)
    await node.wallet.updateHead()

    const blockB = await useMinerBlockFixture(routeTest.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(blockB)
    await node.wallet.updateHead()

    const response = routeTest.client.request<unknown, GetAccountTransactionsResponse>(
      'wallet/getAccountTransactions',
      {
        account: account.name,
      },
    )

    const transactions = await AsyncUtils.materialize(response.contentStream())
    expect(transactions).toHaveLength(2)
  })

  it('optionally streams transactions with decrypted notes', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'with-notes')

    const blockA = await useMinerBlockFixture(node.chain, undefined, account, node.wallet)
    await expect(node.chain).toAddBlock(blockA)
    await node.wallet.updateHead()

    const response = routeTest.client.request<unknown, GetAccountTransactionsResponse>(
      'wallet/getAccountTransactions',
      {
        account: account.name,
        notes: true,
      },
    )

    const transactions = await AsyncUtils.materialize(response.contentStream())
    expect(transactions).toHaveLength(1)

    const responseTransaction = transactions[0]
    Assert.isNotUndefined(responseTransaction.notes)

    expect(responseTransaction.notes).toHaveLength(1)
  })

  it('optionally streams transactions with spends', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'with-spends')

    const { transaction } = await useTxSpendsFixture(node, { account })

    const response = routeTest.client.request<unknown, GetAccountTransactionsResponse>(
      'wallet/getAccountTransactions',
      {
        account: account.name,
        spends: true,
      },
    )

    const transactions = await AsyncUtils.materialize(response.contentStream())
    expect(transactions).toHaveLength(2)

    const [spendTxn] = transactions

    Assert.isNotUndefined(spendTxn.spends)

    expect(spendTxn.spends).toHaveLength(transaction.spends.length)

    const expected = transaction.spends.map((txn) => {
      return {
        commitment: txn.commitment.toString('hex'),
        nullifier: txn.nullifier.toString('hex'),
        size: txn.size,
      }
    })

    const got = spendTxn.spends

    expect(got).toEqual(expected)
  })
})
