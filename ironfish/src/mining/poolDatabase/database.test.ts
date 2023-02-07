/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Assert } from '../../assert'
import { Config } from '../../fileStores'
import { NodeFileProvider } from '../../fileSystems'
import { createRootLogger } from '../../logger'
import { getUniqueTestDataDir } from '../../testUtilities/utils'
import { PoolDatabase } from './database'

describe('poolDatabase', () => {
  let db: PoolDatabase

  beforeEach(async () => {
    const logger = createRootLogger().withTag('test')
    const dataDir = getUniqueTestDataDir()
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()
    // TODO(mat): It would be convenient if we didn't need a filesystem for Config for tests
    const config = new Config(fileSystem, dataDir)

    db = await PoolDatabase.init({
      config,
      logger,
      dbPath: ':memory:',
    })

    await db.start()
  })

  afterEach(async () => {
    await db.stop()
  })

  it('payout periods', async () => {
    const payoutPeriod0 = await db.getCurrentPayoutPeriod()
    expect(payoutPeriod0).toBeUndefined()

    const now = new Date().getTime()
    await db.rolloverPayoutPeriod(now)

    const payoutPeriod1 = await db.getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod1, 'payoutPeriod1 should exist')
    expect(payoutPeriod1.start).toEqual(now)

    const nextTimestamp = now + 10
    await db.rolloverPayoutPeriod(nextTimestamp)

    const payoutPeriod2 = await db.getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod2, 'payoutPeriod2 should exist')
    expect(payoutPeriod2.start).toEqual(nextTimestamp)

    const period1Raw = await db['db'].get(
      'SELECT * FROM payoutPeriod WHERE id = ?',
      payoutPeriod1.id,
    )
    Assert.isNotUndefined(period1Raw, 'period1Raw should exist')
    expect(period1Raw.end).toEqual(payoutPeriod2.start - 1)
  })
})
