/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/unlock', () => {
  const routeTest = createRouteTest()

  it('does nothing if the wallet is decrypted', async () => {
    const passphrase = 'foobar'

    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.unlock({ passphrase })

    const status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(false)
    expect(status.content.locked).toBe(false)
  })

  it('throws if invalid timeout is provided', async () => {
    const timeout = -2
    await expect(
      routeTest.client.wallet.unlock({ passphrase: 'foobar', timeout }),
    ).rejects.toThrow(`Request failed (400) validation: Invalid timeout value: ${timeout}`)
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
      routeTest.client.wallet.unlock({ passphrase: invalidPassphrase }),
    ).rejects.toThrow('Request failed (400) error: Failed to decrypt wallet')

    status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)
  })

  it('unlocks the wallet with the correct passphrase', async () => {
    const passphrase = 'foobar'

    const accountA = await useAccountFixture(routeTest.node.wallet, 'A')
    const accountB = await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.encrypt({ passphrase })

    let status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)

    await routeTest.client.wallet.unlock({ passphrase })

    status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(false)

    const decryptedAccounts = await routeTest.client.wallet.getAccounts()
    expect(decryptedAccounts.content.accounts.sort()).toEqual([accountA.name, accountB.name])

    await routeTest.client.wallet.lock()
  })
})
