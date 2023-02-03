/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Assert } from '../../assert'
import { Config } from '../../fileStores'
import { NodeFileProvider } from '../../fileSystems'
import { createRootLogger } from '../../logger'
import { getUniqueTestDataDir } from '../../testUtilities/utils'
import { PoolDatabase, RawDatabaseBlock, RawDatabasePayoutTransaction } from './database'

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

  it('blocks', async () => {
    const getBlock = async (id: number): Promise<RawDatabaseBlock> => {
      const result = await db['db'].get<RawDatabaseBlock>(
        'SELECT * FROM block WHERE id = ?',
        id,
      )
      Assert.isNotUndefined(result)
      return result
    }

    const minerReward = '2000560003'

    await db.rolloverPayoutPeriod(new Date().getTime())

    // Block 1: main chain and confirmed
    const block1Id = await db.newBlock(1, 'hash1', minerReward)
    Assert.isNotUndefined(block1Id)
    await db.updateBlockStatus(block1Id, true, true)

    await expect(getBlock(block1Id)).resolves.toMatchObject({
      id: block1Id,
      main: 1,
      confirmed: 1,
      minerReward,
    })

    // Block 2: forked and confirmed
    const block2Id = await db.newBlock(1, 'hash2', minerReward)
    Assert.isNotUndefined(block2Id)
    await db.updateBlockStatus(block2Id, false, true)

    await expect(getBlock(block2Id)).resolves.toMatchObject({
      id: block2Id,
      main: 0,
      confirmed: 1,
      minerReward,
    })

    // Block 3: main chain and unconfirmed
    const block3Id = await db.newBlock(2, 'hash3', minerReward)
    Assert.isNotUndefined(block3Id)
    await db.updateBlockStatus(block3Id, true, false)

    await expect(getBlock(block3Id)).resolves.toMatchObject({
      id: block3Id,
      main: 1,
      confirmed: 0,
      minerReward,
    })

    // Block 4: forked and unconfirmed
    const block4Id = await db.newBlock(2, 'hash4', minerReward)
    Assert.isNotUndefined(block4Id)
    await db.updateBlockStatus(block4Id, false, false)

    await expect(getBlock(block4Id)).resolves.toMatchObject({
      id: block4Id,
      main: 0,
      confirmed: 0,
      minerReward,
    })

    const blocks = await db.unconfirmedBlocks()
    expect(blocks.length).toEqual(2)
    expect(blocks[0].id).toEqual(block3Id)
    expect(blocks[1].id).toEqual(block4Id)
  })

  it('transactions', async () => {
    const getTransaction = async (id: number): Promise<RawDatabasePayoutTransaction> => {
      const result = await db['db'].get<RawDatabasePayoutTransaction>(
        'SELECT * FROM payoutTransaction WHERE id = ?',
        id,
      )
      Assert.isNotUndefined(result)
      return result
    }

    await db.rolloverPayoutPeriod(new Date().getTime())

    const payoutPeriod = await db.getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod)

    // Transaction 1: confirmed, unexpired
    const hash1 = 'hash1'
    const transaction1Id = await db.newTransaction(hash1, payoutPeriod.id)
    Assert.isNotUndefined(transaction1Id)
    await db.updateTransactionStatus(transaction1Id, true, false)

    await expect(getTransaction(transaction1Id)).resolves.toMatchObject({
      payoutPeriodId: payoutPeriod.id,
      id: transaction1Id,
      transactionHash: hash1,
      confirmed: 1,
      expired: 0,
    })

    // Transaction 2: unconfirmed, expired
    const hash2 = 'hash2'
    const transaction2Id = await db.newTransaction(hash2, payoutPeriod.id)
    Assert.isNotUndefined(transaction2Id)
    await db.updateTransactionStatus(transaction2Id, false, true)

    await expect(getTransaction(transaction2Id)).resolves.toMatchObject({
      payoutPeriodId: payoutPeriod.id,
      id: transaction2Id,
      transactionHash: hash2,
      confirmed: 0,
      expired: 1,
    })

    // Transaction 3: unconfirmed, unexpired
    const hash3 = 'hash3'
    const transaction3Id = await db.newTransaction(hash3, payoutPeriod.id)
    Assert.isNotUndefined(transaction3Id)
    await db.updateTransactionStatus(transaction3Id, false, false)

    await expect(getTransaction(transaction3Id)).resolves.toMatchObject({
      payoutPeriodId: payoutPeriod.id,
      id: transaction3Id,
      transactionHash: hash3,
      confirmed: 0,
      expired: 0,
    })

    const transactions = await db.unconfirmedTransactions()
    expect(transactions.length).toEqual(1)
    expect(transactions[0].id).toEqual(transaction3Id)
  })
})
