/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useMinersTxFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/broadcastTransaction', () => {
  const routeTest = createRouteTest()

  it('should broadcast a transaction', async () => {
    const transaction = await useMinersTxFixture(routeTest.wallet)

    const broadcastSpy = jest.spyOn(routeTest.peerNetwork, 'broadcastTransaction')

    const response = await routeTest.client.chain.broadcastTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content?.hash).toEqual(transaction.hash().toString('hex'))
    expect(broadcastSpy).toHaveBeenCalled()
  })

  it("should return an error if the transaction won't deserialize", async () => {
    await expect(
      routeTest.client.chain.broadcastTransaction({
        transaction: '0xdeadbeef',
      }),
    ).rejects.toThrow('Out of bounds read')
  })
})
