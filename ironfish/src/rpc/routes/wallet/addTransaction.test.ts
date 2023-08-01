/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useTxSpendsFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/addTransaction', () => {
  const routeTest = createRouteTest()

  it('should add a transaction', async () => {
    const { account, transaction } = await useTxSpendsFixture(routeTest.node, {
      restore: false,
    })

    await expect(account.hasTransaction(transaction.hash())).resolves.toBe(false)

    const response = await routeTest.client.wallet.addTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.accounts[0]).toBe(account.name)
    await expect(account.hasTransaction(transaction.hash())).resolves.toBe(true)
  })

  it('should add an existing transaction', async () => {
    const { account, transaction } = await useTxSpendsFixture(routeTest.node, {
      restore: false,
    })

    await routeTest.wallet.addPendingTransaction(transaction)
    await expect(account.hasTransaction(transaction.hash())).resolves.toBe(true)

    const broadcastSpy = jest.spyOn(routeTest.peerNetwork, 'broadcastTransaction')
    const mempoolAddSpy = jest.spyOn(routeTest.node.memPool, 'acceptTransaction')

    jest.spyOn(routeTest.peerNetwork, 'isReady', 'get').mockImplementationOnce(() => true)

    // Add it again
    const response = await routeTest.client.wallet.addTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content.accounts[0]).toBe(account.name)
    expect(response.content.accepted).toBe(true)
    expect(response.content.hash).toBe(transaction.hash().toString('hex'))
    expect(broadcastSpy).toHaveBeenCalled()
    expect(mempoolAddSpy).toHaveBeenCalled()
  })

  it("should return an error if the transaction won't deserialize", async () => {
    await expect(
      routeTest.client.wallet.addTransaction({
        transaction: '0xdeadbeef',
      }),
    ).rejects.toThrow('Out of bounds read')
  })
})
