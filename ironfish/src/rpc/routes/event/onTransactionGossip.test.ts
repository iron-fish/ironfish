/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture, useMinerBlockFixture, useTxFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route event/onTransactionGossip', () => {
  const routeTest = createRouteTest()

  it('should stream transactions as they are gossiped to the node', async () => {
    const { node } = routeTest

    const account = await useAccountFixture(node.wallet, 'a')
    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    await expect(node.chain).toAddBlock(block2)
    await node.wallet.scan()

    const transaction = await useTxFixture(node.wallet, account, account)

    const response = await routeTest.client.request('event/onTransactionGossip').waitForRoute()

    node.peerNetwork.onTransactionGossipReceived.emit(transaction, true)

    const { value } = await response.contentStream().next()

    expect(value).toMatchObject({
      serializedTransaction: transaction.serialize().toString('hex'),
    })

    response.close()
  })
})
