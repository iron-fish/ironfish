/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetNetworkInfoResponse } from './getNetworkInfo'

describe('Route chain.getNetworkInfo', () => {
  const routeTest = createRouteTest()

  it('returns the network id', async () => {
    const response = await routeTest.client
      .request<GetNetworkInfoResponse>('chain/getNetworkInfo')
      .waitForEnd()

    expect(response.content.networkId).toEqual(routeTest.node.internal.config.networkId)
  })
})
