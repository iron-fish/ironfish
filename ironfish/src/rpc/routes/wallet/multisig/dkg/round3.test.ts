/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../../../assert'
import { createRouteTest } from '../../../../../testUtilities/routeTest'

function removeOneElement<T>(array: Array<T>): Array<T> {
  const newArray = [...array]
  const removeIndex = Math.floor(Math.random() * array.length)
  newArray.splice(removeIndex, 1)
  return newArray
}

describe('Route multisig/dkg/round3', () => {
  const routeTest = createRouteTest()

  it('should create round 3 packages', async () => {
    const participantNames = ['secret-0', 'secret-1', 'secret-2']
    const accountNames = ['account-0', 'account-1', 'account-2']

    // Create participants and retrieve their identities
    await Promise.all(
      participantNames.map((name) =>
        routeTest.client.wallet.multisig.createParticipant({ name }),
      ),
    )
    const participants = await Promise.all(
      participantNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      participantNames.map((participantName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          participantName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      participantNames.map((participantName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          participantName,
          round1SecretPackage: round1Packages[index].content.round1SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        }),
      ),
    )

    const accountCreatedAt = 2

    // Perform DKG round 3
    const round3Responses = await Promise.all(
      participantNames.map((participantName, index) =>
        routeTest.client.wallet.multisig.dkg.round3({
          participantName,
          accountName: accountNames[index],
          round2SecretPackage: round2Packages[index].content.round2SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
          round2PublicPackages: round2Packages.map((pkg) => pkg.content.round2PublicPackage),
          accountCreatedAt,
        }),
      ),
    )

    // Check that all accounts that got imported after round 3 have the same public address
    const publicKeys = await Promise.all(
      accountNames.map(
        async (account) =>
          (
            await routeTest.client.wallet.getAccountPublicKey({ account })
          ).content.publicKey,
      ),
    )
    const expectedPublicKey = publicKeys[0]
    for (const publicKey of publicKeys) {
      expect(publicKey).toBe(expectedPublicKey)
    }

    // Check all the responses match
    expect(round3Responses).toHaveLength(publicKeys.length)
    for (let i = 0; i < round3Responses.length; i++) {
      expect(round3Responses[i].content.name).toEqual(accountNames[i])
      expect(round3Responses[i].content.publicAddress).toEqual(publicKeys[i])
    }

    // Check that the imported accounts all know about other participants'
    // identities
    const expectedIdentities = participants.map(({ identity }) => identity).sort()
    for (const accountName of accountNames) {
      const account = routeTest.wallet.getAccountByName(accountName)
      Assert.isNotNull(account)
      const knownIdentities = account
        .getMultisigParticipantIdentities()
        .map((identity) => identity.toString('hex'))
        .sort()
      expect(knownIdentities).toStrictEqual(expectedIdentities)
    }

    // Check that all imported accounts have createdAt sequence set
    for (const accountName of accountNames) {
      const account = routeTest.wallet.getAccountByName(accountName)
      Assert.isNotNull(account)
      expect(account.createdAt?.sequence).toEqual(accountCreatedAt)
    }
  })

  it('should fail if not all round 1 packages are passed as an input', async () => {
    const participantNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      participantNames.map((name) =>
        routeTest.client.wallet.multisig.createParticipant({ name }),
      ),
    )
    const participants = await Promise.all(
      participantNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      participantNames.map((participantName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          participantName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      participantNames.map((participantName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          participantName,
          round1SecretPackage: round1Packages[index].content.round1SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        }),
      ),
    )

    // Perform DKG round 3
    await expect(
      routeTest.client.wallet.multisig.dkg.round3({
        participantName: participantNames[0],
        round2SecretPackage: round2Packages[0].content.round2SecretPackage,
        round1PublicPackages: removeOneElement(
          round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        ),
        round2PublicPackages: round2Packages.map((pkg) => pkg.content.round2PublicPackage),
      }),
    ).rejects.toThrow('invalid input: expected 3 round 1 public packages, got 2')
  })

  it('should fail if not all round 2 packages are passed as an input', async () => {
    const participantNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      participantNames.map((name) =>
        routeTest.client.wallet.multisig.createParticipant({ name }),
      ),
    )
    const participants = await Promise.all(
      participantNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      participantNames.map((participantName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          participantName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      participantNames.map((participantName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          participantName,
          round1SecretPackage: round1Packages[index].content.round1SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        }),
      ),
    )

    // Perform DKG round 3
    await expect(
      routeTest.client.wallet.multisig.dkg.round3({
        participantName: participantNames[0],
        round2SecretPackage: round2Packages[0].content.round2SecretPackage,
        round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        // Here we cannot just remove any one element to perform this test,
        // because `round2Packages[0]` does not contain any useful
        // information for `participantName[0]`, hence if that gets removed, the
        // operation won't fail. This is why we call `slice()`
        round2PublicPackages: removeOneElement(
          round2Packages.slice(1).map((pkg) => pkg.content.round2PublicPackage),
        ),
      }),
    ).rejects.toThrow('invalid input: expected 2 round 2 public packages, got 1')
  })

  it('should fail passing the wrong round 2 secret package', async () => {
    const participantNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      participantNames.map((name) =>
        routeTest.client.wallet.multisig.createParticipant({ name }),
      ),
    )
    const participants = await Promise.all(
      participantNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      participantNames.map((participantName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          participantName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      participantNames.map((participantName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          participantName,
          round1SecretPackage: round1Packages[index].content.round1SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        }),
      ),
    )

    // Perform DKG round 3
    await expect(
      routeTest.client.wallet.multisig.dkg.round3({
        participantName: participantNames[0],
        round2SecretPackage: round2Packages[1].content.round2SecretPackage,
        round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        round2PublicPackages: round2Packages.map((pkg) => pkg.content.round2PublicPackage),
      }),
    ).rejects.toThrow('decryption error: ciphertext could not be decrypted')
  })
})
