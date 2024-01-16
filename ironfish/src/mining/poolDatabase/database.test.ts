/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { LogLevel } from 'consola'
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
    logger.level = LogLevel.Silent
    const dataDir = getUniqueTestDataDir()
    const fileSystem = new NodeFileProvider()
    await fileSystem.init()
    // TODO(mat): It would be convenient if we didn't need a filesystem for Config for tests
    const config = new Config(fileSystem, dataDir, {})

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

  describe('shares', () => {
    beforeEach(async () => {
      await db.rolloverPayoutPeriod(new Date().getTime())
    })

    const getShares = () => {
      return db['db'].all('SELECT * FROM payoutShare')
    }

    it('inserts new shares', async () => {
      const address1 = 'testPublicAddress1'
      const address2 = 'testPublicAddress2'

      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      await db.newShare(address1)
      await db.newShare(address1)

      await db.rolloverPayoutPeriod(new Date().getTime() + 1_000_000)
      const payoutPeriod2 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod2)

      await db.newShare(address2)

      const shares = await getShares()
      expect(shares.length).toEqual(3)
      expect(shares[0]).toMatchObject({
        publicAddress: address1,
        payoutTransactionId: null,
        payoutPeriodId: payoutPeriod1.id,
      })
      expect(shares[1]).toMatchObject({
        publicAddress: address1,
        payoutTransactionId: null,
        payoutPeriodId: payoutPeriod1.id,
      })
      expect(shares[2]).toMatchObject({
        publicAddress: address2,
        payoutTransactionId: null,
        payoutPeriodId: payoutPeriod2.id,
      })
    })

    it('shareCountSince', async () => {
      const address1 = 'publicAddress1'
      const address2 = 'publicAddress2'

      const before = new Date().getTime() - 10 * 1000 // 10 seconds in the past

      await db.newShare(address1)
      await db.newShare(address2)

      const after = new Date().getTime() + 10 * 1000 // 10 seconds in the future

      await expect(db.shareCountSince(before)).resolves.toEqual(2)
      await expect(db.shareCountSince(after)).resolves.toEqual(0)

      await expect(db.shareCountSince(before, address1)).resolves.toEqual(1)
      await expect(db.shareCountSince(after, address1)).resolves.toEqual(0)
    })

    it('marks shares paid', async () => {
      const address = 'testPublicAddress'

      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      await db.newShare(address)

      await db.rolloverPayoutPeriod(new Date().getTime() + 1_000_000)

      const payoutPeriod2 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod2)

      await db.newShare(address)

      const transactionId = await db.newTransaction('txHash1', payoutPeriod1.id)
      Assert.isNotUndefined(transactionId)

      await db.markSharesPaid(payoutPeriod1.id, transactionId, [address])

      const shares = await getShares()
      expect(shares.length).toEqual(2)
      expect(shares[0]).toMatchObject({
        payoutPeriodId: payoutPeriod1.id,
        payoutTransactionId: transactionId,
      })
      expect(shares[1]).toMatchObject({
        payoutPeriodId: payoutPeriod2.id,
        payoutTransactionId: null,
      })
    })

    it('marks shares unpaid', async () => {
      const address = 'testPublicAddress'

      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      await db.newShare(address)

      const transactionId = await db.newTransaction('txHash1', payoutPeriod1.id)
      Assert.isNotUndefined(transactionId)

      await db.markSharesPaid(payoutPeriod1.id, transactionId, [address])

      const paidShares = await getShares()
      expect(paidShares.length).toEqual(1)
      expect(paidShares[0].payoutTransactionId).toEqual(transactionId)

      await db.markSharesUnpaid(transactionId)

      const unpaidShares = await getShares()
      expect(unpaidShares.length).toEqual(1)
      expect(unpaidShares[0].payoutTransactionId).toBeNull()
    })

    it('deletes unpayable shares', async () => {
      const payoutPeriod = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod)

      await db.newShare('publicAddress1')

      // Sanity check
      await expect(db.payoutPeriodShareCount(payoutPeriod.id)).resolves.toEqual(1)

      await db.deleteUnpayableShares(payoutPeriod.id)

      await expect(db.payoutPeriodShareCount(payoutPeriod.id)).resolves.toEqual(0)
    })

    it('payoutAddresses', async () => {
      const address1 = 'testPublicAddress1'
      const address2 = 'testPublicAddress2'
      const address3 = 'testPublicAddress3'

      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      // Address 1: 2 shares
      await db.newShare(address1)
      await db.newShare(address1)
      // Address 2: 3  shares
      await db.newShare(address2)
      await db.newShare(address2)
      await db.newShare(address2)
      // Address 3: 0 shares

      await db.rolloverPayoutPeriod(new Date().getTime() + 100)

      await db.newShare(address1)
      await db.newShare(address2)
      await db.newShare(address3)

      const addresses = await db.payoutAddresses(payoutPeriod1.id)
      expect(addresses.length).toEqual(2)
      expect(addresses[0]).toMatchObject({
        publicAddress: address1,
        shareCount: 2,
      })
      expect(addresses[1]).toMatchObject({
        publicAddress: address2,
        shareCount: 3,
      })
    })

    it('earliestOutstandingPayoutPeriod', async () => {
      const address = 'testPublicAddress'

      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      await db.newShare(address)

      await db.rolloverPayoutPeriod(new Date().getTime() + 100)

      await db.newShare(address)

      const payoutPeriod2 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod2)

      await db.rolloverPayoutPeriod(new Date().getTime() + 200)

      const earliest1 = await db.earliestOutstandingPayoutPeriod()
      Assert.isNotUndefined(earliest1)
      expect(earliest1.id).toEqual(payoutPeriod1.id)

      await db.markSharesPaid(payoutPeriod1.id, 1, [address])

      const earliest2 = await db.earliestOutstandingPayoutPeriod()
      Assert.isNotUndefined(earliest2)
      expect(earliest2.id).toEqual(payoutPeriod2.id)
    })

    it('payoutPeriodShareCount', async () => {
      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      const shareCount1 = await db.payoutPeriodShareCount(payoutPeriod1.id)
      expect(shareCount1).toEqual(0)

      await db.newShare('addr1')
      await db.newShare('addr1')
      await db.newShare('addr2')

      const shareCount2 = await db.payoutPeriodShareCount(payoutPeriod1.id)
      expect(shareCount2).toEqual(3)

      await db.rolloverPayoutPeriod(new Date().getTime() + 100)

      // Shares goes into other payout period, count should be unchanged
      await db.newShare('addr1')
      await db.newShare('addr3')

      const shareCount3 = await db.payoutPeriodShareCount(payoutPeriod1.id)
      expect(shareCount3).toEqual(3)
    })

    it('pendingShareCount', async () => {
      const payoutPeriod = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod)

      const publicAddress1 = 'publicAddress1'
      const publicAddress2 = 'publicAddress2'

      // 1 share each that is paid out
      await db.newShare(publicAddress1)
      await db.newShare(publicAddress2)

      await db.markSharesPaid(payoutPeriod.id, 1, [publicAddress1, publicAddress2])

      // 1 share each that is not paid out
      await db.newShare(publicAddress1)
      await db.newShare(publicAddress2)

      await db.rolloverPayoutPeriod(new Date().getTime() + 100)

      // 1 share each that is not paid out in another payout period
      await db.newShare(publicAddress1)
      await db.newShare(publicAddress2)

      await expect(db.pendingShareCount()).resolves.toEqual(4)
      await expect(db.pendingShareCount(publicAddress1)).resolves.toEqual(2)
    })

    it('getPayoutReward', async () => {
      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      // Sanity check
      await expect(db.getPayoutReward(payoutPeriod1.id)).resolves.toEqual(0n)

      // Period 1
      const block1Id = await db.newBlock(1, 'hash1', '100')
      Assert.isNotUndefined(block1Id)
      const block2Id = await db.newBlock(1, 'hash2', '100')
      Assert.isNotUndefined(block2Id)

      await db.updateBlockStatus(block1Id, true, true)
      await db.updateBlockStatus(block2Id, false, true)

      // Period 1 reward: 50% of period 1. No previous periods to accumulate value
      await expect(db.getPayoutReward(payoutPeriod1.id)).resolves.toEqual(50n)

      // Period 2
      await db.rolloverPayoutPeriod(new Date().getTime() + 100)
      const payoutPeriod2 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod2)

      const block3Id = await db.newBlock(3, 'hash3', '50')
      Assert.isNotUndefined(block3Id)
      const block4Id = await db.newBlock(4, 'hash4', '50')
      Assert.isNotUndefined(block4Id)

      await db.updateBlockStatus(block3Id, true, true)
      await db.updateBlockStatus(block4Id, true, true)

      // Period 2 reward: 50% of period 2 + 25% of period 1
      await expect(db.getPayoutReward(payoutPeriod2.id)).resolves.toEqual(75n)

      // Period 3
      await db.rolloverPayoutPeriod(new Date().getTime() + 200)
      const payoutPeriod3 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod3)

      const block5Id = await db.newBlock(5, 'hash5', '100')
      Assert.isNotUndefined(block5Id)

      await db.updateBlockStatus(block5Id, true, true)

      // Period 3 reward: 50% of period 3 + 25% of period 2 + 15% of period 1
      await expect(db.getPayoutReward(payoutPeriod3.id)).resolves.toEqual(90n)

      // Period 4
      await db.rolloverPayoutPeriod(new Date().getTime() + 300)
      const payoutPeriod4 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod4)

      const block6Id = await db.newBlock(6, 'hash6', '100')
      Assert.isNotUndefined(block6Id)

      await db.updateBlockStatus(block6Id, true, true)

      // Period 4 reward: 50% of period 4 + 25% of period 3 + 15% of period 2 + 10% of period 1
      await expect(db.getPayoutReward(payoutPeriod4.id)).resolves.toEqual(100n)

      // Period 5 - sanity check that period 1 is not included
      await db.rolloverPayoutPeriod(new Date().getTime() + 400)
      const payoutPeriod5 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod5)

      const block7Id = await db.newBlock(7, 'hash7', '100')
      Assert.isNotUndefined(block7Id)

      await db.updateBlockStatus(block7Id, true, true)

      // Period 5 reward: 50% of period 5 + 25% of period 4 + 15% of period 3 + 10% of period 2 + 0% of period 1
      await expect(db.getPayoutReward(payoutPeriod5.id)).resolves.toEqual(100n)
    })

    it('payoutPeriodBlocksConfirmed', async () => {
      const payoutPeriod1 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod1)

      // Sanity check
      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod1.id)).resolves.toEqual(true)

      // Period 1
      const block1Id = await db.newBlock(1, 'hash1', '100')
      Assert.isNotUndefined(block1Id)
      const block2Id = await db.newBlock(1, 'hash3', '100')
      Assert.isNotUndefined(block2Id)

      await db.updateBlockStatus(block1Id, true, true)
      await db.updateBlockStatus(block2Id, false, true)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod1.id)).resolves.toEqual(true)

      await db.updateBlockStatus(block2Id, true, false)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod1.id)).resolves.toEqual(false)

      // Period 2
      await db.rolloverPayoutPeriod(new Date().getTime() + 100)
      const payoutPeriod2 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod2)

      const block3Id = await db.newBlock(3, 'hash3', '100')
      Assert.isNotUndefined(block3Id)
      await db.updateBlockStatus(block3Id, true, true)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod2.id)).resolves.toEqual(false)

      await db.updateBlockStatus(block2Id, false, true)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod2.id)).resolves.toEqual(true)

      // Period 3 - no blocks
      await db.rolloverPayoutPeriod(new Date().getTime() + 200)
      const payoutPeriod3 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod3)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod3.id)).resolves.toEqual(true)

      // Period 4
      await db.rolloverPayoutPeriod(new Date().getTime() + 300)
      const payoutPeriod4 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod4)

      const block4Id = await db.newBlock(4, 'hash4', '100')
      Assert.isNotUndefined(block4Id)
      await db.updateBlockStatus(block4Id, true, true)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod4.id)).resolves.toEqual(true)

      // Period 5 - does not include blocks from period 1
      await db.rolloverPayoutPeriod(new Date().getTime() + 400)
      const payoutPeriod5 = await db.getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod5)

      await db.updateBlockStatus(block1Id, true, false)

      await expect(db.payoutPeriodBlocksConfirmed(payoutPeriod5.id)).resolves.toEqual(true)
    })
  })
})
