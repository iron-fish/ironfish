/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION, AccountImport, JsonEncoder } from '../../../../wallet'

describe('Route multisig/getAccountIdentity', () => {
  const routeTest = createRouteTest()

  it('returns the identity belonging to an account', async () => {
    const identity1 = await routeTest.client.wallet.multisig.createParticipant({
      name: 'identity1',
    })
    const identity2 = await routeTest.client.wallet.multisig.createParticipant({
      name: 'identity2',
    })

    const participants = [
      { identity: identity1.content.identity },
      { identity: identity2.content.identity },
    ]

    const request = { minSigners: 2, participants }
    const response = await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(
      request,
    )

    const importAccount = await routeTest.client.wallet.importAccount({
      account: response.content.participantAccounts[0].account,
    })

    const accountName = importAccount.content.name

    const accountIdentity = await routeTest.client.wallet.multisig.getAccountIdentity({
      account: accountName,
    })

    expect(accountIdentity.content.identity).toEqual(participants[0].identity)
  })

  it('throws an error for a coordinator account', async () => {
    const identity1 = await routeTest.client.wallet.multisig.createParticipant({
      name: 'identity1',
    })
    const identity2 = await routeTest.client.wallet.multisig.createParticipant({
      name: 'identity2',
    })

    const participants = [
      { identity: identity1.content.identity },
      { identity: identity2.content.identity },
    ]

    const request = { minSigners: 2, participants }
    const response = await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(
      request,
    )

    const account: AccountImport = {
      name: 'coordinator',
      version: ACCOUNT_SCHEMA_VERSION,
      createdAt: null,
      spendingKey: null,
      viewKey: response.content.viewKey,
      incomingViewKey: response.content.incomingViewKey,
      outgoingViewKey: response.content.outgoingViewKey,
      publicAddress: response.content.publicAddress,
      proofAuthorizingKey: response.content.proofAuthorizingKey,
      multisigKeys: {
        publicKeyPackage: response.content.publicKeyPackage,
      },
      ledger: false,
    }

    await routeTest.client.wallet.importAccount({
      account: new JsonEncoder().encode(account),
    })

    await expect(
      routeTest.client.wallet.multisig.getAccountIdentity({
        account: 'coordinator',
      }),
    ).rejects.toThrow('does not have a multisig identity')
  })

  it('throws an error if the account is not a multisig account', async () => {
    const account = await useAccountFixture(routeTest.wallet)

    await expect(
      routeTest.client.wallet.multisig.getAccountIdentity({
        account: account.name,
      }),
    ).rejects.toThrow('is not a multisig account')
  })
})
