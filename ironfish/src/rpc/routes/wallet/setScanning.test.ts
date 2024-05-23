/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { Assert } from '../../../assert'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { SetScanningResponse } from './setScanning'

describe('Route wallet/setScanning', () => {
  const routeTest = createRouteTest()
  let accountName: string

  beforeEach(async () => {
    accountName = uuid()
    await routeTest.node.wallet.createAccount(accountName)
    await routeTest.node.wallet.setDefaultAccount(accountName)
  })

  it('Should set scanning to true', async () => {
    let account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    await account.updateScanningEnabled(false)
    expect(account.scanningEnabled).toBe(false)

    await routeTest.client
      .request<SetScanningResponse>('wallet/setScanning', {
        account: accountName,
        enabled: true,
      })
      .waitForEnd()

    account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    expect(account.scanningEnabled).toBe(true)
  })

  it('Should set scanning to false', async () => {
    let account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    await account.updateScanningEnabled(true)
    expect(account.scanningEnabled).toBe(true)

    await routeTest.client
      .request<SetScanningResponse>('wallet/setScanning', {
        account: accountName,
        enabled: false,
      })
      .waitForEnd()

    account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    expect(account.scanningEnabled).toBe(false)
  })

  it('Should do nothing if scanning is already started', async () => {
    let account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    await account.updateScanningEnabled(true)
    expect(account.scanningEnabled).toBe(true)

    await routeTest.client
      .request<SetScanningResponse>('wallet/setScanning', {
        account: accountName,
        enabled: true,
      })
      .waitForEnd()

    account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    expect(account.scanningEnabled).toBe(true)
  })

  it('Should do nothing if scanning is already stopped', async () => {
    let account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    await account.updateScanningEnabled(false)
    expect(account.scanningEnabled).toBe(false)

    await routeTest.client
      .request<SetScanningResponse>('wallet/setScanning', {
        account: accountName,
        enabled: false,
      })
      .waitForEnd()

    account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    expect(account.scanningEnabled).toBe(false)
  })

  it(`Should error if the account doesn't exist`, async () => {
    await expect(async () => {
      await routeTest.client
        .request<SetScanningResponse>('wallet/setScanning', {
          account: 'foo',
          enabled: false,
        })
        .waitForEnd()
    }).rejects.toThrow('No account with name foo')
  })

  it(`Should error if no account is passed`, async () => {
    await expect(async () => {
      await routeTest.client
        .request<SetScanningResponse>('wallet/setScanning', { enabled: false })
        .waitForEnd()
    }).rejects.toThrow('account must be defined')
  })
})
