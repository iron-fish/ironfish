/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { RPC_ERROR_CODES } from '../../adapters/errors'

describe('Route wallet/encrypt', () => {
  const routeTest = createRouteTest()

  it('decrypts accounts', async () => {
    const passphrase = 'foobar'

    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.encrypt({ passphrase })

    let status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)

    await routeTest.client.wallet.decrypt({ passphrase })

    status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(false)
    expect(status.content.locked).toBe(false)
  })

  it('throws if wallet is already decrypted', async () => {
    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await expect(routeTest.client.wallet.decrypt({ passphrase: 'foobar' })).rejects.toThrow(
      expect.objectContaining({
        message: expect.any(String),
        status: 400,
        code: RPC_ERROR_CODES.WALLET_ALREADY_DECRYPTED,
      }),
    )
  })

  it('throws if wallet decryption fails', async () => {
    const passphrase = 'foobar'
    const invalidPassphrase = 'baz'

    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.encrypt({ passphrase })

    let status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)

    await expect(
      routeTest.client.wallet.decrypt({ passphrase: invalidPassphrase }),
    ).rejects.toThrow('Request failed (400) error: Failed to decrypt wallet')

    status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)
  })
})
