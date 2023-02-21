/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/importViewAccount', () => {
  const routeTest = createRouteTest(true)

  it('should import a view only account that has no spending key', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)

    // delete the account or else the import will fail
    await routeTest.node.wallet.removeAccount(account)

    const response = await routeTest.client
      .request<any>('wallet/importViewAccount', {
        account: {
          name: account.name,
          viewKey: account.viewKey,
          publicAddress: account.publicAddress,
          incomingViewKey: account.incomingViewKey,
          outgoingViewKey: account.outgoingViewKey,
          version: account.version,
        },
        rescan: false,
      })
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: account.name,
      isDefaultAccount: true,
    })
  })
})
