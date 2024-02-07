/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import {
  createNodeTest,
  useAccountAndAddFundsFixture,
  useUnsignedTxFixture,
} from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'

describe('Route multisig/createSigningPackage', () => {
  const routeTest = createRouteTest()
  const nodeTest = createNodeTest()

  it('should create signing package', async () => {
    const seed = 420

    const participants = Array.from({ length: 3 }, () =>
      ParticipantSecret.random().toIdentity(),
    )

    const request = {
      minSigners: 2,
      participants: participants.map((identity) => ({
        identity: identity.serialize().toString('hex'),
      })),
    }

    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(request)
    ).content

    const importAccountRequest = {
      name: 'participant1',
      account: {
        name: 'participant1',
        version: ACCOUNT_SCHEMA_VERSION,
        viewKey: trustedDealerPackage.viewKey,
        incomingViewKey: trustedDealerPackage.incomingViewKey,
        outgoingViewKey: trustedDealerPackage.outgoingViewKey,
        publicAddress: trustedDealerPackage.publicAddress,
        spendingKey: null,
        createdAt: null,
        multisigKeys: {
          keyPackage: trustedDealerPackage.keyPackages[0].keyPackage,
          identity: trustedDealerPackage.keyPackages[0].identity,
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        proofAuthorizingKey: null,
      },
    }

    const response = await routeTest.client.wallet.importAccount(importAccountRequest)

    const commitments: Array<string> = []
    for (let i = 0; i < 3; i++) {
      const signingCommitment = await routeTest.client.wallet.multisig.createSigningCommitment({
        account: response.content.name,
        seed,
      })
      commitments.push(signingCommitment.content.commitment)
    }

    const account = await useAccountAndAddFundsFixture(nodeTest.wallet, nodeTest.chain)
    const unsignedTransaction = await useUnsignedTxFixture(nodeTest.wallet, account, account)
    const unsignedString = unsignedTransaction.serialize().toString('hex')
    const responseSigningPackage = await routeTest.client.wallet.multisig.createSigningPackage({
      commitments,
      unsignedTransaction: unsignedString,
    })

    expect(responseSigningPackage.content).toMatchObject({
      signingPackage: expect.any(String),
    })
  })
})
