/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { UnsignedTransaction } from '@ironfish/rust-nodejs'
import { Transaction } from '../../../primitives'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/buildTransaction', () => {
  const routeTest = createRouteTest(true)

  it('should build a raw transaction', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'existingAccount')

    const rawTransaction = await createRawTransaction({
      wallet: routeTest.node.wallet,
      from: account,
    })

    const response = await routeTest.client.wallet.buildTransaction({
      rawTransaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content.unsignedTransaction).toBeDefined()
  })

  it('should produce output that can be signed', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'signingAccount')

    const block = await useMinerBlockFixture(routeTest.node.chain, undefined, account)
    await routeTest.node.chain.addBlock(block)
    await routeTest.node.wallet.scan()

    const rawTransaction = await createRawTransaction({
      wallet: routeTest.node.wallet,
      from: account,
      expiration: 12345,
    })

    const response = await routeTest.client.wallet.buildTransaction({
      rawTransaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content.unsignedTransaction).toBeDefined()

    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(response.content.unsignedTransaction, 'hex'),
    )
    const signedTransaction = unsignedTransaction.sign(account.spendingKey)

    const transaction = new Transaction(signedTransaction)
    expect(transaction.expiration()).toEqual(rawTransaction.expiration)
  })

  it("should return an error if the transaction won't deserialize", async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'accountB')

    await expect(
      routeTest.client.wallet.buildTransaction({
        rawTransaction: '0xdeadbeef',
        account: account.name,
      }),
    ).rejects.toThrow('Out of bounds read (offset=0).')
  })
})
