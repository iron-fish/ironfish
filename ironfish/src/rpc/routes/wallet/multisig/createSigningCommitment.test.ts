/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { createNodeTest } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'

describe('Route wallet/multisig/createSigningCommitment', () => {
  const routeTest = createRouteTest()
  createNodeTest()

  it('should error on account that does not exist', async () => {
    const account = 'invalid account'
    const request = { account, seed: 0 }
    await expect(
      routeTest.client.wallet.multisig.createSigningCommitment(request),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(` No account with name invalid account`),
        status: 400,
      }),
    )
  })

  it('cannot perform signing commitment if the account is a trusted dealer', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identifier: ParticipantSecret.random().toIdentity().toFrostIdentifier(),
    }))

    const request = { minSigners: 2, participants }

    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(request)
    ).content

    const importAccountRequest = {
      name: 'td',
      account: {
        name: 'td',
        version: ACCOUNT_SCHEMA_VERSION,
        viewKey: trustedDealerPackage.viewKey,
        incomingViewKey: trustedDealerPackage.incomingViewKey,
        outgoingViewKey: trustedDealerPackage.outgoingViewKey,
        publicAddress: trustedDealerPackage.publicAddress,
        spendingKey: null,
        createdAt: null,
        multiSigKeys: {
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        proofAuthorizingKey: null,
      },
    }

    const importAccountResponse = await routeTest.client.wallet.importAccount(
      importAccountRequest,
    )

    await expect(
      routeTest.client.wallet.multisig.createSigningCommitment({
        account: importAccountResponse.content.name,
        seed: 420,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(`Multisig is not a signer`),
        status: 400,
      }),
    )
  })

  it('should create signing commitment', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identifier: ParticipantSecret.random().toIdentity().toFrostIdentifier(),
    }))

    const request = { minSigners: 2, participants }

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
        multiSigKeys: {
          keyPackage: trustedDealerPackage.keyPackages[0].keyPackage,
          identifier: trustedDealerPackage.keyPackages[0].identifier,
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        proofAuthorizingKey: null,
      },
    }

    const importAccountResponse = await routeTest.client.wallet.importAccount(
      importAccountRequest,
    )

    const response = await routeTest.client.wallet.multisig.createSigningCommitment({
      account: importAccountResponse.content.name,
      seed: 420,
    })

    expect(response.content).toMatchObject({
      hiding: expect.any(String),
      binding: expect.any(String),
    })
  })
})
