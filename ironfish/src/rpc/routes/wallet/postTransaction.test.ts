/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { useAccountFixture } from '../../../testUtilities'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/postTransaction', () => {
  const routeTest = createRouteTest(true)

  it('should post a raw transaction offline', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'accountA')
    const addSpy = jest.spyOn(routeTest.node.wallet, 'addPendingTransaction')

    const options = {
      wallet: routeTest.node.wallet,
      from: account,
    }
    const rawTransaction = await createRawTransaction(options)
    const response = await routeTest.client.postTransaction({
      transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      sender: account.name,
      offline: true,
    })

    expect(addSpy).toHaveBeenCalledTimes(0)
    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()
  })

  it('should accept a valid raw transaction', async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
    const addSpy = jest.spyOn(routeTest.node.wallet, 'addPendingTransaction')

    const options = {
      wallet: routeTest.node.wallet,
      from: account,
    }
    const rawTransaction = await createRawTransaction(options)
    const response = await routeTest.client.postTransaction({
      transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
      sender: account.name,
    })

    expect(addSpy).toHaveBeenCalledTimes(1)
    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()
  })

  it("should return an error if the transaction won't deserialize", async () => {
    const account = await useAccountFixture(routeTest.node.wallet, 'accountB')

    await expect(
      routeTest.client.postTransaction({
        transaction: '0xdeadbeef',
        sender: account.name,
      }),
    ).rejects.toThrow('Out of bounds read (offset=0).')
  })
})
