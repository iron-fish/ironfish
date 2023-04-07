/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/estimateFeeRates', () => {
  const routeTest = createRouteTest()

  it('estimates fee rate', async () => {
    const estimateSpy = jest
      .spyOn(routeTest.node.memPool.feeEstimator, 'estimateFeeRate')
      .mockReturnValueOnce(7n)

    const response = await routeTest.client.chain.estimateFeeRate({ priority: 'slow' })
    expect(response.content).toMatchObject({ rate: '7' })
    expect(estimateSpy).toHaveBeenCalledWith('slow')
  })

  it('default rate is average', async () => {
    const estimateSpy = jest
      .spyOn(routeTest.node.memPool.feeEstimator, 'estimateFeeRate')
      .mockReturnValueOnce(1n)

    await routeTest.client.chain.estimateFeeRate()
    expect(estimateSpy).toHaveBeenCalledWith('average')
  })
})
