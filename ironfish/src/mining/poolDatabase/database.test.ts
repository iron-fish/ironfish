/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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

  // TODO(mat): This is an example, new tests will come with the refactor PRs
  it('newShare', async () => {
    const address = 'fakeAddress'
    await db.newShare(address)

    const shareCount = await db.getSharesCountForPayout(address)
    expect(shareCount).toEqual(1)
  })
})
