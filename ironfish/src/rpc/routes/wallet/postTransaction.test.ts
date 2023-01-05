/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/postTransaction', () => {
  const routeTest = createRouteTest(true)

  // TODO remove this when it's not needed for copying anymore
  it('should return account status information', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), true)
    const response = await routeTest.client
      .request<any>('wallet/getAccountsStatus', {})
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
          name: account.name,
          id: account.id,
          headHash: 'NULL',
          headInChain: false,
          sequence: 'NULL',
        },
      ],
    })
  })

  // TODO a valid raw transaction
  it('should return the posted transaction', async () => {
  })
  // TODO an invalid raw transaction that won't deserialize  
  it('should return an error if the transaction won\'t deserialize', async () => {
  })
  // TODO a valid raw transaction but the key isn't managed by the wallet
  it('should return an error if the key isn\'t managed by the wallet', async () => {
  })
  // TODO a valid raw transaction but the account has insufficient funds
  it('should return an error if the account has insufficient funds', async () => {
  })
})
