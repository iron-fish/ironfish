/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RPC_ERROR_CODES } from '../../adapters/errors'

describe('Route wallet/encrypt', () => {
  const routeTest = createRouteTest()

  it('encrypts accounts', async () => {
    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.encrypt({ passphrase: 'foobar' })

    const status = await routeTest.client.wallet.getAccountsStatus()

    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)
  })

  it('throws if wallet is encrypted', async () => {
    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.encrypt({ passphrase: 'foobar' })

    await expect(routeTest.client.wallet.encrypt({ passphrase: 'foobar' })).rejects.toThrow(
      expect.objectContaining({
        message: expect.any(String),
        status: 400,
        code: RPC_ERROR_CODES.WALLET_ALREADY_ENCRYPTED,
      }),
    )
  })
})
