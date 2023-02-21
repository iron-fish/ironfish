/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/exportAccount', () => {
  const routeTest = createRouteTest(true)

  it('should export a default account', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)
    const response = await routeTest.client
      .request<any>('wallet/exportAccount', {
        account: account.name,
        viewOnly: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        spendingKey: account.spendingKey,
        viewKey: account.viewKey,
        outgoingViewKey: account.incomingViewKey,
        publicAddress: account.publicAddress,
        version: account.version,
      },
    })
  })

  it('should omit spending key when view only account is requested', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)
    const response = await routeTest.client
      .request<any>('wallet/exportAccount', {
        account: account.name,
        viewOnly: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        spendingKey: null,
        viewKey: account.viewKey,
        outgoingViewKey: account.incomingViewKey,
        publicAddress: account.publicAddress,
        version: account.version,
      },
    })
  })
})
