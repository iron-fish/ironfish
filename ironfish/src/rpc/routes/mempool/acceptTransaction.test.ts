/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useTxSpendsFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route mempool/acceptTransaction', () => {
  const routeTest = createRouteTest()

  it('returns true when the mempool accepts a transaction', async () => {
    const { transaction } = await useTxSpendsFixture(routeTest.node, {
      restore: false,
    })

    const response = await routeTest.client.mempool.acceptTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.accepted).toBe(true)
  })

  it('returns false when the mempool does not accept a transaction', async () => {
    const { transaction } = await useTxSpendsFixture(routeTest.node, {
      restore: false,
    })

    await routeTest.client.mempool.acceptTransaction({
      transaction: transaction.serialize().toString('hex'),
    })
    const response = await routeTest.client.mempool.acceptTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.accepted).toBe(false)
  })

  it("should return an error if the transaction won't deserialize", async () => {
    await expect(
      routeTest.client.mempool.acceptTransaction({
        transaction: 'foobar',
      }),
    ).rejects.toThrow('Out of bounds read')
  })
})
