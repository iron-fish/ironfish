/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RPC_ERROR_CODES } from '../../adapters/errors'

const REQUEST_PARAMS = {
  account: 'existingAccount',
  newName: 'renamedAccount',
}

describe('Route wallet/rename', () => {
  const routeTest = createRouteTest()

  it('throws if account does not exist', async () => {
    await expect(routeTest.client.wallet.renameAccount(REQUEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.any(String),
        status: 400,
        code: RPC_ERROR_CODES.VALIDATION,
      }),
    )
  })

  it('renames existing account', async () => {
    await useAccountFixture(routeTest.node.wallet, 'existingAccount')

    const accountsBefore = await routeTest.client.wallet.getAccounts()
    expect(accountsBefore.content.accounts).toStrictEqual(['existingAccount'])

    await routeTest.client.wallet.renameAccount(REQUEST_PARAMS)

    const accountsAfter = await routeTest.client.wallet.getAccounts()
    expect(accountsAfter.content.accounts).toStrictEqual(['renamedAccount'])
  })
})
