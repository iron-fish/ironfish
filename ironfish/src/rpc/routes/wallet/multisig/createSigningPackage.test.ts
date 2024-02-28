/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
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

    await routeTest.client.wallet.importAccount({
      name: 'participant1',
      account: trustedDealerPackage.participantAccounts[0].account,
    })

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

    await routeTest.client.wallet.importAccount({
      name: 'participant1',
      account: package1.participantAccounts[0].account,
    })

    // create a transaction for the signing package
    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

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

    await routeTest.client.wallet.importAccount({
      name: 'participant3',
      account: package2.participantAccounts[0].account,
    })

    // include a commitment from participant 3, who is not in the first group
    const signers = [
      { identity: participant1.serialize().toString('hex') },
      { identity: participant3.serialize().toString('hex') },
    ]
    const commitments = [
      (
        await routeTest.client.wallet.multisig.createSigningCommitment({
          account: 'participant1',
          unsignedTransaction,
          signers,
        })
      ).content.commitment,
      (
        await routeTest.client.wallet.multisig.createSigningCommitment({
          account: 'participant3',
          unsignedTransaction,
          signers,
        })
      ).content.commitment,
    ]

    await expect(async () =>
      routeTest.client.wallet.multisig.createSigningPackage({
        account: 'participant1',
        commitments,
        unsignedTransaction,
      }),
    ).rejects.toThrow(RpcRequestError)
  })
})
