/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'

describe('Route wallet/multisig/createSigningCommitment', () => {
  const routeTest = createRouteTest()

  it('should error on account that does not exist', async () => {
    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    const request = { account: 'invalid account', unsignedTransaction, signers: [] }
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
      identity: ParticipantSecret.random().toIdentity().serialize().toString('hex'),
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
        multisigKeys: {
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        proofAuthorizingKey: null,
      },
    }

    const importAccountResponse = await routeTest.client.wallet.importAccount(
      importAccountRequest,
    )

    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    await expect(
      routeTest.client.wallet.multisig.createSigningCommitment({
        account: importAccountResponse.content.name,
        unsignedTransaction,
        signers: [],
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Account ${importAccountResponse.content.name} is not a multisig signer account`,
        ),
        status: 400,
      }),
    )
  })

  it('should create signing commitment', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identity: ParticipantSecret.random().toIdentity().serialize().toString('hex'),
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
        multisigKeys: {
          keyPackage: trustedDealerPackage.keyPackages[0].keyPackage,
          identity: trustedDealerPackage.keyPackages[0].identity,
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        proofAuthorizingKey: null,
      },
    }

    const importAccountResponse = await routeTest.client.wallet.importAccount(
      importAccountRequest,
    )

    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    const response = await routeTest.client.wallet.multisig.createSigningCommitment({
      account: importAccountResponse.content.name,
      unsignedTransaction,
      signers: participants,
    })

    expect(response.content).toMatchObject({
      commitment: expect.any(String),
    })
  })
})
