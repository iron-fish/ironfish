/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import {
  useAccountAndAddFundsFixture,
  useAccountFixture,
} from '../../../testUtilities/fixtures/account'
import { useMinerBlockFixture } from '../../../testUtilities/fixtures/blocks'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ResetAccountResponse } from './resetAccount'

describe('Route wallet/resetAccount', () => {
  const routeTest = createRouteTest()

  it('does not reset createdAt or scanningEnabled if neither are passed', async () => {
    // Add multiple blocks to make sure account head is updated after resetting
    const block1 = await useMinerBlockFixture(routeTest.chain)
    await expect(routeTest.chain).toAddBlock(block1)

    const account = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)

    expect(account.createdAt?.sequence).toEqual(block1.header.sequence)
    expect((await account.getBalance(Asset.nativeId(), 0))?.confirmed).toBe(2000000000n)

    await account.updateScanningEnabled(false)

    await routeTest.client
      .request<ResetAccountResponse>('wallet/resetAccount', {
        account: account.name,
      })
      .waitForEnd()

    const newAccount = routeTest.node.wallet.getAccountByName(account.name)
    Assert.isNotNull(newAccount)

    expect((await newAccount.getBalance(Asset.nativeId(), 0))?.confirmed).toBe(0n)
    expect(newAccount.createdAt).toEqual(account.createdAt)
    expect(newAccount.scanningEnabled).toBe(false)
    expect((await newAccount.getHead())?.hash).toEqualBuffer(routeTest.chain.genesis.hash)
  })

  it('resets createdAt if resetCreatedAt is passed', async () => {
    // Add multiple blocks to make sure account head is updated after resetting
    const block1 = await useMinerBlockFixture(routeTest.chain)
    await expect(routeTest.chain).toAddBlock(block1)

    const account = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)

    expect(account.createdAt?.sequence).toEqual(block1.header.sequence)

    await routeTest.client
      .request<ResetAccountResponse>('wallet/resetAccount', {
        account: account.name,
        resetCreatedAt: true,
      })
      .waitForEnd()

    const newAccount = routeTest.node.wallet.getAccountByName(account.name)
    Assert.isNotNull(newAccount)

    expect(newAccount.createdAt).toBeNull()
    await expect(newAccount.getHead()).resolves.toBeNull()
  })

  it('resets scanningEnabled if resetScanningEnabled is passed', async () => {
    const account = await useAccountFixture(routeTest.wallet)
    expect(account.scanningEnabled).toBe(true)
    await account.updateScanningEnabled(false)

    await routeTest.client
      .request<ResetAccountResponse>('wallet/resetAccount', {
        account: account.name,
        resetScanningEnabled: true,
      })
      .waitForEnd()

    const newAccount = routeTest.node.wallet.getAccountByName(account.name)
    Assert.isNotNull(newAccount)

    expect(newAccount.scanningEnabled).toBe(true)
  })
})
