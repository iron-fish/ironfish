/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { LogLevel } from 'consola'
import { Assert } from '../assert'
import { createRootLogger } from '../logger'
import { useAccountFixture } from '../testUtilities/fixtures/account'
import { createRouteTest } from '../testUtilities/routeTest'
import { Account } from '../wallet'
import { MiningPoolShares } from './poolShares'

describe('poolShares', () => {
  const routeTest = createRouteTest()
  let shares: MiningPoolShares

  beforeEach(async () => {
    const logger = createRootLogger().withTag('test')

    await useAccountFixture(routeTest.node.wallet, 'default')
    await routeTest.wallet.setDefaultAccount('default')

    logger.level = LogLevel.Silent
    shares = await MiningPoolShares.init({
      rpc: routeTest.client,
      config: routeTest.sdk.config,
      logger,
      enablePayouts: true,
      dbPath: ':memory:',
    })

    await shares.start()
  })

  afterEach(async () => {
    await shares.stop()
  })

  describe('start', () => {
    let defaultAccount: Account | null

    beforeEach(() => {
      defaultAccount = routeTest.node.wallet.getDefaultAccount()
    })

    afterEach(async () => {
      await routeTest.node.wallet.setDefaultAccount(defaultAccount?.name ?? null)
    })

    it('throws an error if the pool account does not exist', async () => {
      shares['accountName'] = 'accountDoesNotExist'

      await expect(shares.start()).rejects.toThrow(new RegExp('account not found'))
    })

    it('throws an error if the node has no default account', async () => {
      await routeTest.node.wallet.setDefaultAccount(null)

      await expect(shares.start()).rejects.toThrow(
        new RegExp('no account is active on the node'),
      )
    })

    it('does not check for the pool account if payouts are disabled', async () => {
      shares['enablePayouts'] = false

      const accountExists = jest.spyOn(shares, 'assertAccountExists')

      await shares.start()

      expect(accountExists).not.toHaveBeenCalled()
    })
  })

  it('shareRate', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false })

    const now = new Date(2020, 1, 1).getTime()
    jest.setSystemTime(now)

    await shares.rolloverPayoutPeriod()

    const publicAddress1 = 'publicAddress1'
    const publicAddress2 = 'publicAddress2'

    await shares.submitShare(publicAddress1)
    await shares.submitShare(publicAddress2)

    shares['recentShareCutoff'] = 2

    const shareRate = await shares.shareRate()
    const shareRateAddress = await shares.shareRate(publicAddress1)

    expect(shareRate).toEqual(1)
    expect(shareRateAddress).toEqual(0.5)

    jest.useRealTimers()
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

  it('blocks', async () => {
    await shares.rolloverPayoutPeriod()

    const reward = BigInt(200000)
    await shares.submitBlock(1, 'hash1', reward)
    await shares.submitBlock(2, 'hash2', reward * BigInt(-1))

    const unconfirmedBlocks1 = await shares.unconfirmedBlocks()
    expect(unconfirmedBlocks1.length).toEqual(2)

    // This should be a no-op
    await shares.updateBlockStatus(unconfirmedBlocks1[0], true, false)

    const unconfirmedBlocks2 = await shares.unconfirmedBlocks()
    expect(unconfirmedBlocks2.length).toEqual(2)

    // This should update the 'main' boolean, but the block should still show up
    await shares.updateBlockStatus(unconfirmedBlocks2[0], false, false)

    const unconfirmedBlocks3 = await shares.unconfirmedBlocks()
    expect(unconfirmedBlocks3.length).toEqual(2)
    expect(unconfirmedBlocks3[0]).toMatchObject({
      blockSequence: 1,
      blockHash: 'hash1',
      minerReward: reward,
      main: false,
    })

    await shares.updateBlockStatus(unconfirmedBlocks3[0], false, true)

    const unconfirmedBlocks4 = await shares.unconfirmedBlocks()
    expect(unconfirmedBlocks4.length).toEqual(1)
    expect(unconfirmedBlocks4[0]).toMatchObject({
      blockSequence: 2,
      blockHash: 'hash2',
      minerReward: reward,
    })
  })

  describe('transactions', () => {
    beforeEach(async () => {
      await shares.rolloverPayoutPeriod()
    })

    it('expected flow', async () => {
      const payoutPeriod = await shares['db'].getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod)

      await shares['db'].newTransaction('hash1', payoutPeriod.id)
      await shares['db'].newTransaction('hash2', payoutPeriod.id)

      const unconfirmedTransactions1 = await shares.unconfirmedPayoutTransactions()
      expect(unconfirmedTransactions1.length).toEqual(2)

      // This should be a no-op
      await shares.updatePayoutTransactionStatus(unconfirmedTransactions1[0], false, false)

      const unconfirmedTransactions2 = await shares.unconfirmedPayoutTransactions()
      expect(unconfirmedTransactions2.length).toEqual(2)

      await shares.updatePayoutTransactionStatus(unconfirmedTransactions1[0], true, false)

      const unconfirmedTransactions3 = await shares.unconfirmedPayoutTransactions()
      expect(unconfirmedTransactions3.length).toEqual(1)

      await shares.updatePayoutTransactionStatus(unconfirmedTransactions1[1], false, true)

      const unconfirmedTransactions4 = await shares.unconfirmedPayoutTransactions()
      expect(unconfirmedTransactions4.length).toEqual(0)
    })

    it('expired transactions should mark shares unpaid', async () => {
      const payoutPeriod = await shares['db'].getCurrentPayoutPeriod()
      Assert.isNotUndefined(payoutPeriod)

      const address = 'testPublicAddress'

      await shares['db'].newShare(address)
      const transactionId = await shares['db'].newTransaction('hash1', payoutPeriod.id)
      Assert.isNotUndefined(transactionId)
      await shares['db'].markSharesPaid(payoutPeriod.id, transactionId, [address])

      await shares['db'].rolloverPayoutPeriod(new Date().getTime() + 10 * 1000)

      // All shares paid out, so there should be no outstanding payout periods
      const outstandingPeriod1 = await shares['db'].earliestOutstandingPayoutPeriod()
      expect(outstandingPeriod1).toBeUndefined()

      const unconfirmedTransactions = await shares.unconfirmedPayoutTransactions()
      expect(unconfirmedTransactions.length).toEqual(1)

      // Mark transaction expired
      await shares.updatePayoutTransactionStatus(unconfirmedTransactions[0], false, true)

      // Share has been marked unpaid, so the payout period should be outstanding again
      const outstandingPeriod2 = await shares['db'].earliestOutstandingPayoutPeriod()
      expect(outstandingPeriod2).toBeDefined()

      jest.useRealTimers()
    })
  })

  it('createNewPayout', async () => {
    jest.useFakeTimers({ legacyFakeTimers: false })

    const now = new Date(2020, 1, 1).getTime()
    jest.setSystemTime(now)

    const publicAddress1 = 'testPublicAddress1'
    const publicAddress2 = 'testPublicAddress2'

    await shares.rolloverPayoutPeriod()

    const payoutPeriod1 = await shares['db'].getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod1)

    // Setup some shares to be paid out
    await shares.submitShare(publicAddress1)
    await shares.submitShare(publicAddress2)
    await shares.submitShare(publicAddress2)

    // Setup a block for some reward to pay out
    await shares.submitBlock(1, 'blockHash1', BigInt(102))
    const blocks = await shares.unconfirmedBlocks()
    expect(blocks.length).toEqual(1)
    await shares.updateBlockStatus(blocks[0], true, true)

    // Move the clock forward the amount of time needed to trigger a new payout rollover
    jest.setSystemTime(now + shares.config.get('poolPayoutPeriodDuration') * 1000)

    // Setup some shares to not be paid out since they are in a separate period
    await shares.rolloverPayoutPeriod()
    const payoutPeriod2 = await shares['db'].getCurrentPayoutPeriod()
    Assert.isNotUndefined(payoutPeriod2)

    await shares.submitShare(publicAddress1)
    await shares.submitShare(publicAddress2)

    const hasBalanceSpy = jest.spyOn(shares, 'hasAvailableBalance').mockResolvedValueOnce(true)
    const sendTransactionSpy = jest
      .spyOn(shares, 'sendTransaction')
      .mockResolvedValueOnce('testTransactionHash')

    // Create payout
    await shares.createNewPayout()

    // The expected reward total breakdown should be as follows:
    // - 1 period (to simplify the calculation, we're not including any past periods)
    // - 1 block reward of 102
    // - Since this block was found in this period, the total reward amount is 102 * 50% = 51
    // - 2 recipients, so we subtract the naive fee of 1 ORE per recipient to
    //    calculate the reward per share = 49
    // - 3 shares total, so 48 / 3 = 16 reward per share (truncate decimals because ORE is indivisable)
    // - 16 reward per share * 3 shares + fee of 2 = 50
    expect(hasBalanceSpy).toHaveBeenCalledWith(BigInt(50))
    const assetId = Asset.nativeId().toString('hex')
    expect(sendTransactionSpy).toHaveBeenCalledWith([
      // Address 1 had 1 share, with 16 reward per share = 16 amount
      {
        publicAddress: publicAddress1,
        amount: '16',
        memo: `Iron Fish Pool payout ${payoutPeriod1.id}`,
        assetId,
      },
      // Address 2 had 2 shares, with 16 reward per share = 32 amount
      {
        publicAddress: publicAddress2,
        amount: '32',
        memo: `Iron Fish Pool payout ${payoutPeriod1.id}`,
        assetId,
      },
    ])

    const transactions = await shares.unconfirmedPayoutTransactions()
    expect(transactions.length).toEqual(1)

    await expect(shares['db'].payoutAddresses(payoutPeriod1.id)).resolves.toEqual([])

    const unpaidShares = await shares['db'].payoutAddresses(payoutPeriod2.id)
    expect(unpaidShares.length).toEqual(2)

    jest.useRealTimers()
  })

  describe('sendTransaction', () => {
    let defaultAccount: Account | null

    beforeEach(() => {
      defaultAccount = routeTest.node.wallet.getDefaultAccount()
    })

    afterEach(async () => {
      await routeTest.node.wallet.setDefaultAccount(defaultAccount?.name ?? null)
    })

    it('throws an error if no account exists with accountName', async () => {
      shares['accountName'] = 'fakeAccount'

      const output = {
        publicAddress: 'testPublicAddress',
        amount: '42',
        memo: 'for testing',
        assetId: 'testAsset',
      }

      await expect(shares.sendTransaction([output])).rejects.toThrow(
        new RegExp('No account with name'),
      )
    })

    it('throws an error if node has no default account', async () => {
      await routeTest.node.wallet.setDefaultAccount(null)

      const output = {
        publicAddress: 'testPublicAddress',
        amount: '42',
        memo: 'for testing',
        assetId: 'testAsset',
      }

      await expect(shares.sendTransaction([output])).rejects.toThrow(
        new RegExp('No account is currently active on the node'),
      )
    })
  })
})
