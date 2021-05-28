/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { GetChainInfoResponse } from './getChainInfo'

describe('Route chain.getChainInfo', () => {
  const routeTest = createRouteTest()

  it('returns the right object with hash', async () => {
    const response = await routeTest.adapter.request<GetChainInfoResponse>('chain/getChainInfo')

    expect(response.content.currentBlockIdentifier.index).toEqual(
      routeTest.chain.latest.sequence.toString(),
    )
    expect(response.content.genesisBlockIdentifier.index).toEqual(
      routeTest.chain.genesis.sequence.toString(),
    )
    expect(response.content.oldestBlockIdentifier.index).toEqual(
      routeTest.chain.head.sequence.toString(),
    )
    expect(response.content.currentBlockTimestamp).toEqual(
      Number(routeTest.chain.latest.timestamp),
    )
  }, 10000)
})
