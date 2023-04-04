/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTxSpendsFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/broadcastTransaction', () => {
  const routeTest = createRouteTest()

  it('should broadcast a transaction', async () => {
    const { account, transaction } = await useTxSpendsFixture(routeTest.node, {
      restore: false,
    })

    await expect(account.hasTransaction(transaction.hash())).resolves.toBe(false)

    const broadcastSpy = jest.spyOn(routeTest.peerNetwork, 'broadcastTransaction')

    const response = routeTest.client.broadcastTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(broadcastSpy).toHaveBeenCalled()
  })

  it('should rebroadcast an existing transaction', async () => {
    const { account, transaction } = await useTxSpendsFixture(routeTest.node, {
      restore: false,
    })

    await routeTest.wallet.addPendingTransaction(transaction)
    await expect(account.hasTransaction(transaction.hash())).resolves.toBe(true)

    // Add it again
    await routeTest.client.addTransaction({
      transaction: transaction.serialize().toString('hex'),
      broadcast: true,
    })

    const peerNetworkBroadcastSpy = jest.spyOn(routeTest.peerNetwork, 'broadcastTransaction')

    // Broadcast it again
    const rebroadcastResponse = routeTest.client.broadcastTransaction({
      transaction: transaction.serialize().toString('hex'),
    })
    expect(rebroadcastResponse.status).toBe(200)
    expect(peerNetworkBroadcastSpy).toHaveBeenCalled()
  })

  it("should return an error if the transaction won't deserialize", async () => {
    await expect(
      routeTest.client.broadcastTransaction({
        transaction: '0xdeadbeef',
      }),
    ).rejects.toThrow('Out of bounds read')
  })
})
