/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createRootLogger } from '../logger'
import { createRouteTest } from '../testUtilities/routeTest'
import { MiningPoolShares } from './poolShares'

describe('poolShares', () => {
  const routeTest = createRouteTest()
  let shares: MiningPoolShares

  beforeEach(async () => {
    shares = await MiningPoolShares.init({
      rpc: routeTest.client,
      config: routeTest.sdk.config,
      logger: createRootLogger().withTag('test'),
      enablePayouts: false,
    })

    await shares.start()
  })

  afterEach(async () => {
    await shares.stop()
  })

  // TODO(mat): This is an example, new tests will come with the refactor PRs
  it('submitShare', async () => {
    const address = 'fakeAddress'
    await shares.submitShare(address)

    const shareCount = await shares.sharesPendingPayout(address)
    expect(shareCount).toEqual(1)
  })
})
