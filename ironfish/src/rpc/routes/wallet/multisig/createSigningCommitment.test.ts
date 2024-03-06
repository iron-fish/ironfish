/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'
import { CreateParticipantResponse } from './createParticipant'

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
    // Create a bunch of multisig identities
    const accountNames = Array.from({ length: 3 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(
        async (name) =>
          (
            await routeTest.client
              .request<CreateParticipantResponse>('wallet/multisig/createParticipant', { name })
              .waitForEnd()
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

    // Create an unsigned transaction
    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    // Create the signing commitment
    const response = await routeTest.client.wallet.multisig.createSigningCommitment({
      account: accountNames[0],
      unsignedTransaction,
      signers: participants,
    })

    expect(response.content).toMatchObject({
      commitment: expect.any(String),
    })
  })
})
