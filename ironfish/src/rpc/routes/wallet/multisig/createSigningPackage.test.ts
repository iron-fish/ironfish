/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'

describe('Route multisig/createSigningPackage', () => {
  const routeTest = createRouteTest()

  it('should create signing package', async () => {
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

    await routeTest.client.wallet.importAccount(importAccountRequest)

    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    const commitments = await Promise.all(
      participants.map(async (_) => {
        const signingCommitment =
          await routeTest.client.wallet.multisig.createSigningCommitment({
            unsignedTransaction,
            signers: participants.map((identity) => ({
              identity: identity.serialize().toString('hex'),
            })),
          })
        return signingCommitment.content.commitment
      }),
    )

    const responseSigningPackage = await routeTest.client.wallet.multisig.createSigningPackage({
      commitments,
      unsignedTransaction,
    })

    expect(responseSigningPackage.content).toMatchObject({
      signingPackage: expect.any(String),
    })
  })
})
