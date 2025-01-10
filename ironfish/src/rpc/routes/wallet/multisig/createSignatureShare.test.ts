/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../../../../assert'
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { ACCOUNT_SCHEMA_VERSION, AssertMultisig } from '../../../../wallet'

describe('Route wallt/multisig/createSignatureShare', () => {
  const routeTest = createRouteTest()

  it('should fail for an account that does not exist', async () => {
    await expect(
      routeTest.client.wallet.multisig.createSignatureShare({
        account: 'non-existent',
        signingPackage: 'fake',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('No account with name'),
        status: 400,
      }),
    )
  })

  it('should fail for an account that does not have multisig keys', async () => {
    const key = generateKey()

    const accountImport = {
      ...key,
      id: '1',
      name: 'fake coordinator',
      version: ACCOUNT_SCHEMA_VERSION,
      spendingKey: null,
      createdAt: null,
      ledger: false,
    }

    const account = await routeTest.wallet.importAccount(accountImport)

    await expect(
      routeTest.client.wallet.multisig.createSignatureShare({
        account: account.name,
        signingPackage: 'fake',
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        status: 400,
      }),
    )
  })

  it('should fail if signing package contains commitments from unknown signers', async () => {
    // Create a bunch of multisig identities
    const accountNames = Array.from({ length: 3 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(async (name) => {
        const identity = (await routeTest.client.wallet.multisig.createParticipant({ name }))
          .content.identity
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
    const signingPackage = (
      await routeTest.client.wallet.multisig.createSigningPackage({
        commitments,
        unsignedTransaction,
      })
    ).content.signingPackage

    // Alter the public key package to replace one identity with another, so
    // that we can later pretend that we created a signature share from an
    // unknown identity
    const account = routeTest.wallet.getAccountByName(accountNames[0])
    Assert.isNotNull(account)
    AssertMultisig(account)

    const fromIdentity = participants[1].identity
    const toIdentity = participants[2].identity
    account.multisigKeys.publicKeyPackage = account.multisigKeys.publicKeyPackage.replace(
      fromIdentity,
      toIdentity,
    )

    await routeTest.wallet.walletDb.setAccount(account)

    // Attempt to create signature share
    await expect(
      routeTest.client.wallet.multisig.createSignatureShare({
        account: account.name,
        signingPackage,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'Signing package contains commitment from unknown signer',
        ),
        status: 400,
      }),
    )
  })
})
