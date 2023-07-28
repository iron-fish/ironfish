/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/estimateFeeRates', () => {
  const routeTest = createRouteTest()

  it('gives same fee rate estimates as chain/estimateFeeRates', async () => {
    jest.spyOn(routeTest.node.memPool.feeEstimator, 'estimateFeeRates').mockReturnValue({
      slow: 1n,
      average: 2n,
      fast: 3n,
    })

    const chainResponse = await routeTest.client.chain.estimateFeeRates()

    expect(chainResponse.content).toMatchObject({
      slow: '1',
      average: '2',
      fast: '3',
    })

    const walletResponse = await routeTest.client.wallet.estimateFeeRates()

    expect(walletResponse.content).toMatchObject(chainResponse.content)
  })
})
