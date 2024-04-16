/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import * as native from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'

jest.mock('@ironfish/rust-nodejs', () => {
  const moduleMock = jest.requireActual<typeof native>('@ironfish/rust-nodejs')
  return {
    ...moduleMock,
    generateNewPublicAddress: jest.fn().mockReturnValue({
      public_address: '8a4685307f159e95418a0dd3d38a3245f488c1baf64bc914f53486efd370c563',
    }),
  }
})

describe('Route wallet/getPublicKey', () => {
  const routeTest = createRouteTest(true)
  let account = {} as Account
  let publicAddress = ''

  beforeAll(async () => {
    account = await routeTest.node.wallet.createAccount(uuid())
    await routeTest.node.wallet.setDefaultAccount(account.name)
    publicAddress = account.publicAddress
  })

  it('should return the account data', async () => {
    const response = await routeTest.client.wallet.getAccountPublicKey({
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: account.name,
      publicKey: publicAddress,
    })
  })
})
