/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Peer } from '../../../network/peers/peer'
import { useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route event/onTransactionGossip', () => {
  const routeTest = createRouteTest()

  it('should stream transactions as they are gossiped to the node', async () => {
    const { node } = routeTest

    const response = await routeTest.client.request('event/onTransactionGossip').waitForRoute()

    const { transaction } = await useBlockWithTx(routeTest.node)

    const peer = new Peer(null)

    await node.peerNetwork['onNewTransaction'](peer, transaction)

    const { value } = await response.contentStream().next()

    expect(value).toMatchObject({
      serializedTransaction: transaction.serialize().toString('hex'),
    })

    response.end()
    expect(response.status).toEqual(200)
  })
})
