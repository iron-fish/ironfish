/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRouteTest } from '../../../testUtilities/routeTest'
import { Response as GetConsensusParametersResponse } from './getConsensusParameters'

describe('Route chain.getConsensusParameters', () => {
  const routeTest = createRouteTest()

  it('returns the right parameters', async () => {
    const response = await routeTest.client
      .request<GetConsensusParametersResponse>('chain/getConsensusParameters')
      .waitForEnd()

    expect(response.content.allowedBlockFuturesSeconds).toEqual(
      routeTest.chain.consensus.parameters.allowedBlockFutureSeconds,
    )
    expect(response.content.genesisSupplyInIron).toEqual(
      routeTest.chain.consensus.parameters.genesisSupplyInIron,
    )
    expect(response.content.targetBlockTimeInSeconds).toEqual(
      routeTest.chain.consensus.parameters.targetBlockTimeInSeconds,
    )
    expect(response.content.targetBucketTimeInSeconds).toEqual(
      routeTest.chain.consensus.parameters.targetBucketTimeInSeconds,
    )
    expect(response.content.maxBlockSizeBytes).toEqual(
      routeTest.chain.consensus.parameters.maxBlockSizeBytes,
    )
    expect(response.content.minFee).toEqual(routeTest.chain.consensus.parameters.minFee)
  })
})
