/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetNetworkInfoResponse } from './getNetworkInfo'

describe('Route chain.getNetworkInfo', () => {
  const routeTest = createRouteTest()

  it('returns the network info', async () => {
    const response = await routeTest.client
      .request<GetNetworkInfoResponse>('chain/getNetworkInfo')
      .waitForEnd()

    expect(response.content.networkIdentity).toEqual(
      routeTest.node.internal.config.networkIdentity,
    )
    expect(response.content.telemetryNodeId).toEqual(
      routeTest.node.internal.config.telemetryNodeId,
    )
    expect(response.content.rpcAuthToken).toEqual(routeTest.node.internal.config.rpcAuthToken)
    expect(response.content.networkId).toEqual(routeTest.node.internal.config.networkId)
  })

  it('returns the network id', async () => {
    const response = await routeTest.client
      .request<GetNetworkInfoResponse>('chain/getNetworkInfo', {
        name: 'networkId',
      })
      .waitForEnd()

    expect(response.content.isFirstRun).toBeUndefined()

    expect(response.content.networkIdentity).toBeUndefined()

    expect(response.content.telemetryNodeId).toBeUndefined()

    expect(response.content.rpcAuthToken).toBeUndefined()

    expect(response.content.networkId).toEqual(routeTest.node.internal.config.networkId)
  })
})
