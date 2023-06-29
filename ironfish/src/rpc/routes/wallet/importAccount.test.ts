/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ImportResponse } from './importAccount'

describe('Route wallet/importAccount', () => {
  const routeTest = createRouteTest(true)

  it('should import a view only account that has no spending key', async () => {
    const key = generateKey()

    const accountName = 'foo'
    const response = await routeTest.client
      .request<ImportResponse>('wallet/importAccount', {
        account: {
          name: accountName,
          viewKey: key.viewKey,
          spendingKey: null,
          publicAddress: key.publicAddress,
          incomingViewKey: key.incomingViewKey,
          outgoingViewKey: key.outgoingViewKey,
          version: 1,
          createdAt: null,
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: true,
    })
  })

  it('should import a spending account', async () => {
    const key = generateKey()

    const accountName = 'bar'
    const response = await routeTest.client
      .request<ImportResponse>('wallet/importAccount', {
        account: {
          name: accountName,
          viewKey: key.viewKey,
          spendingKey: key.spendingKey,
          publicAddress: key.publicAddress,
          incomingViewKey: key.incomingViewKey,
          outgoingViewKey: key.outgoingViewKey,
          version: 1,
          createdAt: null,
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: accountName,
      isDefaultAccount: false, // This is false because the default account is already imported in a previous test
    })
  })

  it('should throw when account.name and name are not set', async () => {
    const key = generateKey()
    await expect(async () => {
      await routeTest.client
        .request<ImportResponse>('wallet/importAccount', {
          account: {
            viewKey: key.viewKey,
            spendingKey: key.spendingKey,
            publicAddress: key.publicAddress,
            incomingViewKey: key.incomingViewKey,
            outgoingViewKey: key.outgoingViewKey,
            version: 1,
            createdAt: null,
          },
          rescan: false,
        })
        .waitForEnd()
    }).rejects.toThrow('Account name is required')
  })
})
