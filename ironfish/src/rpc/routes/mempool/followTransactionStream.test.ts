/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useBlockWithTx } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route mempool/followTransactionStream', () => {
  const routeTest = createRouteTest()

  it('should stream transactions as they are added to the mempool', async () => {
    const { node } = routeTest

    const response = await routeTest.client
      .request('mempool/followTransactionStream')
      .waitForRoute()

    const { transaction } = await useBlockWithTx(routeTest.node)

    node.memPool.acceptTransaction(transaction)

    const { value } = await response.contentStream().next()

    expect(value).toMatchObject({
      serializedTransaction: transaction.serialize().toString('hex'),
    })

    response.end()
    expect(response.status).toEqual(200)
  })
})
