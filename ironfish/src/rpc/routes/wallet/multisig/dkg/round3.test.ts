/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
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
    const secretNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      secretNames.map((name) => routeTest.client.wallet.multisig.createParticipant({ name })),
    )
    const participants = await Promise.all(
      secretNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      secretNames.map((secretName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          secretName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      secretNames.map((secretName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          secretName,
          encryptedSecretPackage: round1Packages[index].content.encryptedSecretPackage,
          publicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
        }),
      ),
    )

    // Only override 2/3 names
    const secretNamesToName = {
      [secretNames[0]]: 'foo',
      [secretNames[2]]: 'bar',
    }

    // Perform DKG round 3
    const round3Responses = await Promise.all(
      secretNames.map((secretName, index) =>
        routeTest.client.wallet.multisig.dkg.round3({
          secretName,
          name: secretNamesToName[secretName],
          round2SecretPackage: round2Packages[index].content.encryptedSecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
          round2PublicPackages: round2Packages.flatMap((pkg) =>
            pkg.content.publicPackages
              .filter(
                ({ recipientIdentity }) => recipientIdentity === participants[index].identity,
              )
              .map(({ publicPackage }) => publicPackage),
          ),
        }),
      ),
    )

    // Check that all accounts that got imported after round 3 have the same public address
    const publicKeys = await Promise.all(
      secretNames.map(
        async (account) =>
          (
            await routeTest.client.wallet.getAccountPublicKey({
              account: secretNamesToName[account] ?? account,
            })
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
      expect(round3Responses[i].content.name).toEqual(
        secretNamesToName[secretNames[i]] ?? secretNames[i],
      )
      expect(round3Responses[i].content.publicAddress).toEqual(publicKeys[i])
    }
  })

  it('should fail if not all round 1 packages are passed as an input', async () => {
    const secretNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      secretNames.map((name) => routeTest.client.wallet.multisig.createParticipant({ name })),
    )
    const participants = await Promise.all(
      secretNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      secretNames.map((secretName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          secretName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      secretNames.map((secretName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          secretName,
          encryptedSecretPackage: round1Packages[index].content.encryptedSecretPackage,
          publicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
        }),
      ),
    )

    // Perform DKG round 3
    await expect(
      routeTest.client.wallet.multisig.dkg.round3({
        secretName: secretNames[0],
        round2SecretPackage: round2Packages[0].content.encryptedSecretPackage,
        round1PublicPackages: removeOneElement(
          round1Packages.map((pkg) => pkg.content.publicPackage),
        ),
        round2PublicPackages: round2Packages.flatMap((pkg) =>
          pkg.content.publicPackages
            .filter(({ recipientIdentity }) => recipientIdentity === participants[0].identity)
            .map(({ publicPackage }) => publicPackage),
        ),
      }),
    ).rejects.toThrow('invalid input: expected 3 round 1 public packages, got 2')
  })

  it('should fail if not all round 2 packages are passed as an input', async () => {
    const secretNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      secretNames.map((name) => routeTest.client.wallet.multisig.createParticipant({ name })),
    )
    const participants = await Promise.all(
      secretNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      secretNames.map((secretName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          secretName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      secretNames.map((secretName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          secretName,
          encryptedSecretPackage: round1Packages[index].content.encryptedSecretPackage,
          publicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
        }),
      ),
    )

    // Perform DKG round 3
    await expect(
      routeTest.client.wallet.multisig.dkg.round3({
        secretName: secretNames[0],
        round2SecretPackage: round2Packages[0].content.encryptedSecretPackage,
        round1PublicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
        round2PublicPackages: removeOneElement(
          round2Packages.flatMap((pkg) =>
            pkg.content.publicPackages
              .filter(({ recipientIdentity }) => recipientIdentity === participants[0].identity)
              .map(({ publicPackage }) => publicPackage),
          ),
        ),
      }),
    ).rejects.toThrow('invalid input: expected 2 round 2 public packages, got 1')
  })

  it('should fail passing the wrong round 2 secret package', async () => {
    const secretNames = ['secret-0', 'secret-1', 'secret-2']

    // Create participants and retrieve their identities
    await Promise.all(
      secretNames.map((name) => routeTest.client.wallet.multisig.createParticipant({ name })),
    )
    const participants = await Promise.all(
      secretNames.map(
        async (name) => (await routeTest.client.wallet.multisig.getIdentity({ name })).content,
      ),
    )

    // Perform DKG round 1
    const round1Packages = await Promise.all(
      secretNames.map((secretName) =>
        routeTest.client.wallet.multisig.dkg.round1({
          secretName,
          minSigners: 2,
          participants,
        }),
      ),
    )

    // Perform DKG round 2
    const round2Packages = await Promise.all(
      secretNames.map((secretName, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          secretName,
          encryptedSecretPackage: round1Packages[index].content.encryptedSecretPackage,
          publicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
        }),
      ),
    )

    // Perform DKG round 3
    await expect(
      routeTest.client.wallet.multisig.dkg.round3({
        secretName: secretNames[0],
        round2SecretPackage: round2Packages[1].content.encryptedSecretPackage,
        round1PublicPackages: round1Packages.map((pkg) => pkg.content.publicPackage),
        round2PublicPackages: round2Packages.flatMap((pkg) =>
          pkg.content.publicPackages
            .filter(({ recipientIdentity }) => recipientIdentity === participants[0].identity)
            .map(({ publicPackage }) => publicPackage),
        ),
      }),
    ).rejects.toThrow('decryption error: aead::Error')
  })
})
