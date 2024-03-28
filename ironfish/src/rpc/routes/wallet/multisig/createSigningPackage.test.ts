/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountAndAddFundsFixture, useUnsignedTxFixture } from '../../../../testUtilities'
import { createRouteTest } from '../../../../testUtilities/routeTest'

describe('Route multisig/createSigningPackage', () => {
  const routeTest = createRouteTest()

  it('should create signing package', async () => {
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
    const responseSigningPackage = await routeTest.client.wallet.multisig.createSigningPackage({
      commitments,
      unsignedTransaction,
    })
    expect(responseSigningPackage.content).toMatchObject({
      signingPackage: expect.any(String),
    })
  })

  it('should create signing package with a subset of signers', async () => {
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

    // Create signing commitments for 2 of 3 participants
    const commitments = await Promise.all(
      accountNames.slice(0, 2).map(async (accountName) => {
        const signingCommitment =
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: accountName,
            unsignedTransaction,
            signers: participants.slice(0, 2),
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

  describe('should verify commitment consistency', () => {
    it('of identities', async () => {
      // Create a bunch of multisig identities
      const accountNames = Array.from({ length: 4 }, (_, index) => `test-account-${index}`)
      const participants = await Promise.all(
        accountNames.map(async (name) => {
          const identity = (await routeTest.client.wallet.multisig.createParticipant({ name }))
            .content.identity
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
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(
            /Commitment 1 is from identity .+, which is not part of the multsig group for account .+/,
          ),
          status: 400,
        }),
      )

      await expect(async () =>
        routeTest.client.wallet.multisig.createSigningPackage({
          account: mixedParticipants[1].name,
          commitments,
          unsignedTransaction,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringMatching(
            /Commitment 0 is from identity .+, which is not part of the multsig group for account .+/,
          ),
          status: 400,
        }),
      )
    })

    it('of transactions', async () => {
      // Create a bunch of multisig identities
      const accountNames = Array.from({ length: 4 }, (_, index) => `test-account-${index}`)
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

      // Create two unsigned transactions
      const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
      const unsignedTransaction1 = (
        await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
      )
        .serialize()
        .toString('hex')
      const unsignedTransaction2 = (
        await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
      )
        .serialize()
        .toString('hex')

      // Create signing commitments mixing participants from different groups
      const commitments = [
        (
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: participants[0].name,
            unsignedTransaction: unsignedTransaction1,
            signers: participants.slice(0, 2),
          })
        ).content.commitment,
        (
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: participants[1].name,
            unsignedTransaction: unsignedTransaction2,
            signers: participants.slice(0, 2),
          })
        ).content.commitment,
      ]

      // Try to create the signing package
      await expect(async () =>
        routeTest.client.wallet.multisig.createSigningPackage({
          account: participants[0].name,
          commitments,
          unsignedTransaction: unsignedTransaction1,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(
            'Commitment 1 was not generated for the given unsigned transaction and signer set',
          ),
          status: 400,
        }),
      )
    })

    it('of signer set', async () => {
      // Create a bunch of multisig identities
      const accountNames = Array.from({ length: 4 }, (_, index) => `test-account-${index}`)
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

      // Create an unsigned transactions
      const txAccount = await useAccountAndAddFundsFixture(routeTest.wallet, routeTest.chain)
      const unsignedTransaction = (
        await useUnsignedTxFixture(routeTest.wallet, txAccount, txAccount)
      )
        .serialize()
        .toString('hex')

      // Create signing commitments mixing participants from different groups
      const commitments = [
        (
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: participants[0].name,
            unsignedTransaction,
            signers: participants,
          })
        ).content.commitment,
        (
          await routeTest.client.wallet.multisig.createSigningCommitment({
            account: participants[1].name,
            unsignedTransaction,
            signers: [participants[0], participants[1]],
          })
        ).content.commitment,
      ]

      // Try to create the signing package
      await expect(async () =>
        routeTest.client.wallet.multisig.createSigningPackage({
          account: participants[0].name,
          commitments,
          unsignedTransaction,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          message: expect.stringContaining(
            'Commitment 0 was not generated for the given unsigned transaction and signer set',
          ),
          status: 400,
        }),
      )
    })
  })

  it('should verify minimum number of commitments', async () => {
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

    // Create only one signing commitment
    const signingCommitment = (
      await routeTest.client.wallet.multisig.createSigningCommitment({
        account: accountNames[0],
        unsignedTransaction,
        signers: participants,
      })
    ).content.commitment

    await expect(async () =>
      routeTest.client.wallet.multisig.createSigningPackage({
        account: accountNames[0],
        commitments: [signingCommitment],
        unsignedTransaction,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'A minimum of 2 signers is required for a valid signature. Only 1 commitments provided',
        ),
        status: 400,
      }),
    )
  })
})
