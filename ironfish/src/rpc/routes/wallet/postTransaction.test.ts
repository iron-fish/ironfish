/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Transaction } from '../../../primitives'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { useAccountFixture } from '../../../testUtilities'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/postTransaction', () => {
  const routeTest = createRouteTest()

  it('should post a raw transaction and not broadcast', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'accountA')
    const addSpy = jest.spyOn(routeTest.node.wallet, 'addPendingTransaction')

    const rawTransaction = await createRawTransaction({
      wallet: routeTest.node.wallet,
      from: account,
      mints: [
        {
          creator: account.publicAddress,
          name: 'test',
          metadata: 'test',
          value: 1n,
        },
      ],
    })

    const response = await routeTest.client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      broadcast: false,
    })

    expect(addSpy).toHaveBeenCalledTimes(0)
    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()
    const transaction = new Transaction(Buffer.from(response.content.transaction, 'hex'))
    expect(response.content.hash).toBe(transaction.hash().toString('hex'))
  })

  it('should post a raw transaction', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'accountA')

    const rawTransaction = await createRawTransaction({
      wallet: routeTest.node.wallet,
      from: account,
      mints: [
        {
          creator: account.publicAddress,
          name: 'test',
          metadata: 'test',
          value: 1n,
        },
      ],
    })

    const response = await routeTest.client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()
    const transaction = new Transaction(Buffer.from(response.content.transaction, 'hex'))
    expect(response.content.hash).toBe(transaction.hash().toString('hex'))
  })

  it("should return an error if the transaction won't deserialize", async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'accountC')

    await expect(
      routeTest.client.wallet.postTransaction({
        transaction: '0xdeadbeef',
        account: account.name,
      }),
    ).rejects.toThrow('Out of bounds read (offset=0).')
  })
})
