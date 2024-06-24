/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getAccountsStatus', () => {
  const routeTest = createRouteTest()

  it('should return account head', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), {
      setDefault: true,
    })

    const block = await useMinerBlockFixture(routeTest.chain, 2, account, routeTest.wallet)

    await expect(routeTest.chain).toAddBlock(block)
    await routeTest.wallet.scan()

    const response = await routeTest.client.wallet.getAccountsStatus()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
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
      ],
    })
  })

  it('should return true for view-only accounts', async () => {
    let account = await routeTest.wallet.createAccount('temp')
    await routeTest.wallet.removeAccountByName('temp')
    account = await routeTest.wallet.importAccount({
      ...account,
      name: 'viewonly',
      spendingKey: null,
    })

    const response = await routeTest.client.wallet.getAccountsStatus()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
          name: account.name,
          id: account.id,
          head: null,
          scanningEnabled: true,
          viewOnly: true,
        },
      ],
    })
  })

  it('returns false when scanning is disabled', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), {
      setDefault: true,
    })
    await routeTest.client.wallet.setScanning({ account: account.name, enabled: false })
    const response = await routeTest.client.wallet.getAccountsStatus()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
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
      ],
    })
  })
})
