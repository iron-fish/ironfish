/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ImportResponse } from './utils'

describe('Route wallet/importSpendAccount', () => {
  const routeTest = createRouteTest(true)

  it('should import a spending account', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)

    // delete the account or else the import will fail
    await routeTest.node.wallet.removeAccount(account)

    const response = await routeTest.client
      .request<ImportResponse>('wallet/importSpendAccount', {
        account: {
          name: account.name,
          spendingKey: account.spendingKey,
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
