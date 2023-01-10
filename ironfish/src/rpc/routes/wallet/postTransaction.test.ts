/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { v4 as uuid } from 'uuid'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { createRawTransaction } from '../../../testUtilities/helpers/transaction'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/postTransaction', () => {
  const routeTest = createRouteTest(true)

  it('should accept a valid raw transaction', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)
    const options = {
      wallet: routeTest.node.wallet,
      from: account,
    }
    const rawTransaction = await createRawTransaction(options)
    const response = await routeTest.client.postTransaction({
      transaction: RawTransactionSerde.serialize(rawTransaction).toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()
  })

  it("should return an error if the transaction won't deserialize", async () => {
    await expect(
      routeTest.client.postTransaction({
        transaction: '0xdeadbeef',
      }),
    ).rejects.toThrow('Out of bounds read (offset=0).')
  })
})
