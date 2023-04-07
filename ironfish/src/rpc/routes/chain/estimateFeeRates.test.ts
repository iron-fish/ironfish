/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/estimateFeeRates', () => {
  const routeTest = createRouteTest()

  it('estimates fee rates', async () => {
    jest.spyOn(routeTest.node.memPool.feeEstimator, 'estimateFeeRates').mockReturnValueOnce({
      slow: 1n,
      average: 2n,
      fast: 3n,
    })

    const response = await routeTest.client.chain.estimateFeeRates()

    expect(response.content).toMatchObject({
      slow: '1',
      average: '2',
      fast: '3',
    })
  })
})
