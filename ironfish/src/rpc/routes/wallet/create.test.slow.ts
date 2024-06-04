/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RPC_ERROR_CODES } from '../../adapters'
import { RpcRequestError } from '../../clients/errors'

describe('Route wallet/create', () => {
  jest.setTimeout(15000)
  const routeTest = createRouteTest()

  beforeEach(() => {
    jest.spyOn(routeTest.node.wallet, 'scan').mockReturnValue(Promise.resolve(null))
  })

  it('should create an account', async () => {
    await routeTest.node.wallet.createAccount('existingAccount', { setDefault: true })

    const name = uuid()

    const response = await routeTest.client.wallet.createAccount({ name })
    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: name,
      publicAddress: expect.any(String),
      isDefaultAccount: false,
    })

    const account = routeTest.node.wallet.getAccountByName(name)
    expect(account).toMatchObject({
      name: name,
      publicAddress: response.content.publicAddress,
    })
  })

  it('should set the account as default', async () => {
    await routeTest.node.wallet.setDefaultAccount(null)

    const name = uuid()

    const response = await routeTest.client.wallet.createAccount({ name })
    expect(response.content).toMatchObject({
      name: name,
      publicAddress: expect.any(String),
      isDefaultAccount: true,
    })
    expect(routeTest.node.wallet.getDefaultAccount()?.name).toBe(name)
  })

  it('should fail if name already exists', async () => {
    const name = uuid()

    await routeTest.node.wallet.createAccount(name)

    try {
      expect.assertions(2)
      await routeTest.client.wallet.createAccount({ name: name })
    } catch (e: unknown) {
      if (!(e instanceof RpcRequestError)) {
        throw e
      }
      expect(e.status).toBe(400)
      expect(e.code).toBe(RPC_ERROR_CODES.DUPLICATE_ACCOUNT_NAME)
    }
  })

  it('should start scanning transactions for the new account', async () => {
    const scanSpy = jest
      .spyOn(routeTest.node.wallet, 'scan')
      .mockReturnValue(Promise.resolve(null))

    await routeTest.node.wallet.createAccount('existingAccount', { setDefault: true })

    const name = uuid()

    const response = await routeTest.client.wallet.createAccount({ name })
    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      name: name,
      publicAddress: expect.any(String),
      isDefaultAccount: false,
    })

    expect(scanSpy).toHaveBeenCalled()
  })
})
