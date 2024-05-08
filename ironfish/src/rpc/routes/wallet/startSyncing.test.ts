/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { Assert } from '../../../assert'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { StartSyncingResponse } from './startSyncing'

describe('Route wallet/startSyncing', () => {
  const routeTest = createRouteTest()
  let accountName: string

  beforeEach(async () => {
    accountName = uuid()
    await routeTest.node.wallet.createAccount(accountName)
    await routeTest.node.wallet.setDefaultAccount(accountName)
  })

  it('Should set syncing to true', async () => {
    let account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    account.updateSyncingEnabled(false)
    expect(account.syncingEnabled).toBe(false)

    await routeTest.client
      .request<StartSyncingResponse>('wallet/startSyncing', {
        account: accountName,
      })
      .waitForEnd()

    account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    expect(account.syncingEnabled).toBe(true)
  })

  it('Should do nothing if syncing is already started', async () => {
    let account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    account.updateSyncingEnabled(true)
    expect(account.syncingEnabled).toBe(true)

    await routeTest.client
      .request<StartSyncingResponse>('wallet/startSyncing', {
        account: accountName,
      })
      .waitForEnd()

    account = routeTest.node.wallet.getAccountByName(accountName)
    Assert.isNotNull(account)
    expect(account.syncingEnabled).toBe(true)
  })

  it(`Should error if the account doesn't exist`, async () => {
    await expect(async () => {
      await routeTest.client
        .request<StartSyncingResponse>('wallet/startSyncing', {
          account: 'foo',
        })
        .waitForEnd()
    }).rejects.toThrow('No account with name foo')
  })

  it(`Should error if the no account is passed`, async () => {
    await expect(async () => {
      await routeTest.client
        .request<StartSyncingResponse>('wallet/startSyncing', {})
        .waitForEnd()
    }).rejects.toThrow('account must be defined')
  })
})
