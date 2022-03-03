/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as native from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { Account } from '../../../account'
import { createRouteTest } from '../../../testUtilities/routeTest'

jest.mock('@ironfish/rust-nodejs', () => {
  const moduleMock = jest.requireActual<typeof native>('@ironfish/rust-nodejs')
  return {
    ...moduleMock,
    generateNewPublicAddress: jest.fn().mockReturnValue({ publicAddress: 'newkey' }),
  }
})

describe('Route account/getPublicKey', () => {
  const routeTest = createRouteTest()
  let account = {} as Account
  let publicAddress = ''

  beforeAll(async () => {
    account = await routeTest.node.accounts.createAccount(uuid())
    await routeTest.node.accounts.setDefaultAccount(account.name)
    publicAddress = account.publicAddress
  })

  it('should return the account data', async () => {
    const response = await routeTest.adapter.request<any>('account/getPublicKey', {
      account: account.name,
      generate: false,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: account.name,
      publicKey: publicAddress,
    })
  })

  it('should regenerate the account key', async () => {
    const response = await routeTest.adapter.request<any>('account/getPublicKey', {
      account: account.name,
      generate: true,
    })

    expect(response.status).toBe(200)
    expect(response.content.account).toEqual(account.name)
    expect(response.content.publicAddress).not.toEqual(publicAddress)
  })
})
