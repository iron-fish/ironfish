/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
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
      dbPath: ':memory:',
    })

    await shares.start()
  })

  afterEach(async () => {
    await shares.stop()
  })

  it('rolloverPayoutPeriod', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false })

    const now = new Date(2020, 1, 1).getTime()
    jest.setSystemTime(now)

    const payoutPeriod0 = await shares['db'].getCurrentPayoutPeriod()
    expect(payoutPeriod0).toBeUndefined()

    await shares.rolloverPayoutPeriod()

    const payoutPeriod1 = await shares['db'].getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod1, 'payoutPeriod1 should exist')

    // No time has elapsed, so it will not rollover
    await shares.rolloverPayoutPeriod()

    const payoutPeriod1A = await shares['db'].getCurrentPayoutPeriod()
    expect(payoutPeriod1A).toEqual(payoutPeriod1)

    // Move the clock forward the amount of time needed to trigger a new payout rollover
    jest.setSystemTime(now + shares.config.get('poolPayoutPeriodDuration') * 1000)

    await shares.rolloverPayoutPeriod()

    const payoutPeriod2 = await shares['db'].getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod2, 'payoutPeriod2 should exist')
    expect(payoutPeriod2.id).toEqual(payoutPeriod1.id + 1)

    jest.useRealTimers()
  })
})
