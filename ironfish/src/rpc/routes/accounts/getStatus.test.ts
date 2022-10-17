/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'

describe('Route account/status', () => {
  const routeTest = createRouteTest(true)
  let account = {} as Account

  beforeAll(async () => {
    account = await routeTest.node.wallet.createAccount(uuid())
    await routeTest.node.wallet.setDefaultAccount(account.name)
  })

  it('should return account status information', async () => {
    const response = await routeTest.client
      .request<any>('account/getAccountsStatus', {})
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
          account: account.name,
          id: account.id,
          headHash: 'NULL',
          headInChain: false,
          sequence: 'NULL',
        },
      ],
    })
  })
})
