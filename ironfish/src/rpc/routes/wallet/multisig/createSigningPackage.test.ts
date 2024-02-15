/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { RpcRequestError } from '../../../clients'
import { CreateIdentityResponse } from './createIdentity'

describe('Route multisig/createSigningPackage', () => {
  const routeTest = createRouteTest()

  it('should create signing package', async () => {
    // Create a bunch of multisig identities
    const accountNames = Array.from({ length: 3 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(async (name) => {
        const identity = (
          await routeTest.client
            .request<CreateIdentityResponse>('wallet/multisig/createIdentity', { name })
            .waitForEnd()
        ).content.identity
        return { name, identity }
      }),
    )

    // Initialize the group though TDK and import the accounts generated
    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants,
      })
    ).content
    for (const { name, identity } of participants) {
      const importAccount = trustedDealerPackage.participantAccounts.find(
        (account) => account.identity === identity,
      )
      expect(importAccount).not.toBeUndefined()
      await routeTest.client.wallet.importAccount({
        name,
        account: importAccount!.account,
      })
    }

    // Create an unsigned transaction
    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    // Create signing commitments for all participants
    const commitments = await Promise.all(
      accountNames.map(async (accountName) => {
        const signingCommitment =
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: accountName,
            unsignedTransaction,
            signers: participants,
          })
        return signingCommitment.content.commitment
      }),
    )

    // Create the signing package
    const responseSigningPackage = await routeTest.client.wallet.multisig.createSigningPackage({
      commitments,
      unsignedTransaction,
    })
    expect(responseSigningPackage.content).toMatchObject({
      signingPackage: expect.any(String),
    })
  })

  it('should verify commitment identities', async () => {
    // Create a bunch of multisig identities
    const accountNames = Array.from({ length: 4 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(async (name) => {
        const identity = (
          await routeTest.client
            .request<CreateIdentityResponse>('wallet/multisig/createIdentity', { name })
            .waitForEnd()
        ).content.identity
        return { name, identity }
      }),
    )

    // Split the participants in two groups
    const participantsGroup1 = participants.slice(0, 2)
    const participantsGroup2 = participants.slice(2)

    // Initialize the first group though TDK and import the accounts generated
    const trustedDealerPackage1 = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants: participantsGroup1,
      })
    ).content
    for (const { name, identity } of participantsGroup1) {
      const importAccount = trustedDealerPackage1.participantAccounts.find(
        (account) => account.identity === identity,
      )
      expect(importAccount).not.toBeUndefined()
      await routeTest.client.wallet.importAccount({
        name,
        account: importAccount!.account,
      })
    }

    // Initialize the second group though TDK and import the accounts generated
    const trustedDealerPackage2 = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants: participantsGroup2,
      })
    ).content
    for (const { name, identity } of participantsGroup2) {
      const importAccount = trustedDealerPackage2.participantAccounts.find(
        (account) => account.identity === identity,
      )
      expect(importAccount).not.toBeUndefined()
      await routeTest.client.wallet.importAccount({
        name,
        account: importAccount!.account,
      })
    }

    // Create an unsigned transaction
    const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
    const unsignedTransaction = (
      await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
    )
      .serialize()
      .toString('hex')

    // Create signing commitments mixing participants from different groups
    const mixedParticipants = [participantsGroup1[0], participantsGroup2[0]]
    const commitments = await Promise.all(
      mixedParticipants.map(async ({ name }) => {
        const signingCommitment =
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: name,
            unsignedTransaction,
            signers: participants,
          })
        return signingCommitment.content.commitment
      }),
    )

    // Try to create the signing package
    await expect(async () =>
      routeTest.client.wallet.multisig.createSigningPackage({
        account: mixedParticipants[0].name,
        commitments,
        unsignedTransaction,
      }),
    ).rejects.toThrow(RpcRequestError)

    await expect(async () =>
      routeTest.client.wallet.multisig.createSigningPackage({
        account: mixedParticipants[1].name,
        commitments,
        unsignedTransaction,
      }),
    ).rejects.toThrow(RpcRequestError)
  })
})
