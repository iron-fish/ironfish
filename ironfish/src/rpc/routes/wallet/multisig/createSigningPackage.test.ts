/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createSigningCommitment, ParticipantSecret } from '@ironfish/rust-nodejs'
import { Assert } from '../../../../assert'
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION } from '../../../../wallet'
import { RpcRequestError } from '../../../clients'

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
      account: 'participant1',
      commitments,
      unsignedTransaction,
    })

    expect(responseSigningPackage.content).toMatchObject({
      signingPackage: expect.any(String),
    })
  })

  it('should verify commitment identities', async () => {
    // create a multisig group and import an account
    const participant1 = ParticipantSecret.random().toIdentity()
    const participant2 = ParticipantSecret.random().toIdentity()
    const keyRequest1 = {
      minSigners: 2,
      participants: [
        { identity: participant1.serialize().toString('hex') },
        { identity: participant2.serialize().toString('hex') },
      ],
    }

    const package1 = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(keyRequest1)
    ).content

    const importAccountRequest = {
      name: 'participant1',
      account: {
        name: 'participant1',
        version: ACCOUNT_SCHEMA_VERSION,
        viewKey: package1.viewKey,
        incomingViewKey: package1.incomingViewKey,
        outgoingViewKey: package1.outgoingViewKey,
        publicAddress: package1.publicAddress,
        spendingKey: null,
        createdAt: null,
        multisigKeys: {
          keyPackage: package1.keyPackages[0].keyPackage,
          identity: package1.keyPackages[0].identity,
          publicKeyPackage: package1.publicKeyPackage,
        },
        proofAuthorizingKey: null,
      },
    }

    await routeTest.client.wallet.importAccount(importAccountRequest)

    // add participants 1 and 2 to address book for participant 1
    const account1 = routeTest.wallet.getAccountByName('participant1')
    Assert.isNotNull(account1)
    await routeTest.wallet.walletDb.addParticipantIdentity(account1, participant1.serialize())
    await routeTest.wallet.walletDb.addParticipantIdentity(account1, participant2.serialize())

    // create a transaction for the signing package
    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = await useUnsignedTxFixture(
      routeTest.wallet,
      txAccount,
      txAccount,
    )

    // create a second multisig group
    const participant3 = ParticipantSecret.random().toIdentity()
    const participant4 = ParticipantSecret.random().toIdentity()
    const keyRequest2 = {
      minSigners: 2,
      participants: [
        { identity: participant3.serialize().toString('hex') },
        { identity: participant4.serialize().toString('hex') },
      ],
    }

    const package2 = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(keyRequest2)
    ).content

    // include a commitment from participant 3, who is not in the first group
    const commitments = [
      createSigningCommitment(
        participant1.serialize().toString('hex'),
        package1.keyPackages[0].keyPackage,
        unsignedTransaction.withReference((t) => t.hash()),
        [participant1.serialize().toString('hex'), participant2.serialize().toString('hex')],
      ),
      createSigningCommitment(
        participant3.serialize().toString('hex'),
        package2.keyPackages[0].keyPackage,
        unsignedTransaction.withReference((t) => t.hash()),
        [participant1.serialize().toString('hex'), participant2.serialize().toString('hex')],
      ),
    ]

    await expect(async () =>
      routeTest.client.wallet.multisig.createSigningPackage({
        account: 'participant1',
        commitments,
        unsignedTransaction: unsignedTransaction.serialize().toString('hex'),
      }),
    ).rejects.toThrow(RpcRequestError)
  })
})
