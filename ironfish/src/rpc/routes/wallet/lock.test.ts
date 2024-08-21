/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/lock', () => {
  const routeTest = createRouteTest()

  it('does nothing if the wallet is decrypted', async () => {
    await useAccountFixture(routeTest.node.wallet, 'A')
    await useAccountFixture(routeTest.node.wallet, 'B')

    await routeTest.client.wallet.lock()

    const status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(false)
    expect(status.content.locked).toBe(false)
  })

  it('locks the wallet', async () => {
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

    let decryptedAccounts = await routeTest.client.wallet.getAccounts()
    expect(decryptedAccounts.content.accounts.sort()).toEqual([accountA.name, accountB.name])

    await routeTest.client.wallet.lock()

    status = await routeTest.client.wallet.getAccountsStatus()
    expect(status.content.encrypted).toBe(true)
    expect(status.content.locked).toBe(true)

    decryptedAccounts = await routeTest.client.wallet.getAccounts()
    expect(decryptedAccounts.content.accounts).toHaveLength(0)
  })
})
