/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getAccountStatus', () => {
  const routeTest = createRouteTest()

  it('returns account status information', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), {
      setDefault: true,
    })
    const response = await routeTest.client.wallet.getAccountStatus({
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        id: account.id,
        head: {
          hash: routeTest.chain.head.hash.toString('hex'),
          sequence: routeTest.chain.head.sequence,
          inChain: true,
        },
        scanningEnabled: true,
        viewOnly: false,
      },
    })
  })

  it('returns false if scanning is disabled', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), {
      setDefault: true,
    })
    await routeTest.client.wallet.setScanning({ account: account.name, enabled: false })

    const response = await routeTest.client.wallet.getAccountStatus({
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        id: account.id,
        head: {
          hash: routeTest.chain.head.hash.toString('hex'),
          sequence: routeTest.chain.head.sequence,
          inChain: true,
        },
        scanningEnabled: false,
        viewOnly: false,
      },
    })
  })

  it('errors if no account exists', async () => {
    await expect(
      routeTest.client.wallet.getAccountStatus({
        account: 'asdf',
      }),
    ).rejects.toThrow('No account with name asdf')
  })
})
