/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { v4 as uuid } from 'uuid'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getAccountStatus', () => {
  const routeTest = createRouteTest()

  it('returns account status information', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), {
      setDefault: true,
    })
    const response = await routeTest.client.wallet.getAccountStatus({
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        id: account.id,
        head: {
          hash: routeTest.chain.head.hash.toString('hex'),
          sequence: routeTest.chain.head.sequence,
          inChain: true,
        },
        scanningEnabled: true,
        viewOnly: false,
        multisigAccount: false,
      },
    })
  })

  it('returns true if multisig account', async () => {
    // Create 2 multisig identities
    const accountNames = Array.from({ length: 2 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(
        async (name) =>
          (
            await routeTest.client.wallet.multisig.createParticipant({ name })
          ).content,
      ),
    )

    // Initialize the group though TDK and import one of the accounts generated
    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants,
      })
    ).content
    const importAccount = trustedDealerPackage.participantAccounts.find(
      ({ identity }) => identity === participants[0].identity,
    )
    expect(importAccount).not.toBeUndefined()
    await routeTest.client.wallet.importAccount({
      name: accountNames[0],
      account: importAccount!.account,
    })

    const response = await routeTest.client.wallet.getAccountStatus({
      account: accountNames[0],
    })

    expect(response.content.account.multisigAccount).toBe(true)
  })

  it('returns false if scanning is disabled', async () => {
    const account = await routeTest.node.wallet.createAccount(uuid(), {
      setDefault: true,
    })
    await routeTest.client.wallet.setScanning({ account: account.name, enabled: false })

    const response = await routeTest.client.wallet.getAccountStatus({
      account: account.name,
    })

    expect(response.status).toBe(200)
    expect(response.content).toMatchObject({
      account: {
        name: account.name,
        id: account.id,
        head: {
          hash: routeTest.chain.head.hash.toString('hex'),
          sequence: routeTest.chain.head.sequence,
          inChain: true,
        },
        scanningEnabled: false,
        viewOnly: false,
        multisigAccount: false,
      },
    })
  })

  it('errors if no account exists', async () => {
    await expect(
      routeTest.client.wallet.getAccountStatus({
        account: 'asdf',
      }),
    ).rejects.toThrow('No account with name asdf')
  })
})
