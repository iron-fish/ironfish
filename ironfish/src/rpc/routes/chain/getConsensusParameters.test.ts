/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain.getConsensusParameters', () => {
  const routeTest = createRouteTest()

  it('returns the right parameters', async () => {
    const response = await routeTest.client.chain.getConsensusParameters()

    const chainParams = routeTest.chain.consensus.parameters
    expect(response.content).toEqual(chainParams)
  })
})
