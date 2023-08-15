/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { Assert } from '../../../assert'
import { useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getAccountsStatus', () => {
  const routeTest = createRouteTest(true)

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
          headHash: routeTest.chain.head.hash.toString('hex'),
          headInChain: true,
          sequence: routeTest.chain.head.sequence,
        },
      ],
    })
  })

  it('should return account head and sequence', async () => {
    const account = routeTest.wallet.getDefaultAccount()
    Assert.isNotNull(account)

    const block = await useMinerBlockFixture(routeTest.chain, 2, account, routeTest.wallet)

    await expect(routeTest.chain).toAddBlock(block)
    await routeTest.wallet.updateHead()

    const response = await routeTest.client
      .request<any>('wallet/getAccountsStatus', {})
      .waitForEnd()

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      accounts: [
        {
          name: account.name,
          id: account.id,
          headHash: routeTest.chain.head.hash.toString('hex'),
          headInChain: true,
          sequence: routeTest.chain.head.sequence,
        },
      ],
    })
  })
})
