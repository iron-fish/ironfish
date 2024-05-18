/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'

describe('Route wallet/getAccount', () => {
  const routeTest = createRouteTest(true)
  let account = {} as Account
  let publicAddress = ''

  beforeAll(async () => {
    account = await routeTest.node.wallet.createAccount(uuid())
    publicAddress = account.publicAddress
  })

  it('should get account data by name', async () => {
    const response = await routeTest.client.wallet.getAccount({
      name: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        publicAddress: publicAddress,
      },
    })
  })

  it('should get account data by publicAddress', async () => {
    const response = await routeTest.client.wallet.getAccount({
      publicAddress,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        publicAddress: publicAddress,
      },
    })
  })

  it('should return null if no account is found', async () => {
    const response = await routeTest.client.wallet.getAccount({
      name: 'not found',
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: null,
    })
  })

  it('should require at least one of name or publicAddress', async () => {
    await expect(routeTest.client.wallet.getAccount({})).rejects.toThrow(
      expect.objectContaining({
        status: 400,
      }),
    )
  })

  it('should require only one of name or publicAddress', async () => {
    await expect(
      routeTest.client.wallet.getAccount({ name: account.name, publicAddress }),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 400,
      }),
    )
  })
})
