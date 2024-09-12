/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { Assert } from '../../../../../assert'
import { createRouteTest } from '../../../../../testUtilities/routeTest'

describe('Route multisig/dkg/round1', () => {
  const routeTest = createRouteTest()

  it('should create round 1 packages', async () => {
    const participantName = 'name'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName })

    const identity = (
      await routeTest.client.wallet.multisig.getIdentity({ name: participantName })
    ).content.identity
    const otherParticipants = Array.from({ length: 2 }, () => ({
      identity: multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
    }))
    const participants = [{ identity }, ...otherParticipants]

    const request = { participantName, minSigners: 2, participants }
    const response = await routeTest.client.wallet.multisig.dkg.round1(request)

    expect(response.content).toMatchObject({
      round1SecretPackage: expect.any(String),
      round1PublicPackage: expect.any(String),
    })

    // Ensure that the encrypted secret package can be decrypted
    const secretValue = await routeTest.node.wallet.walletDb.getMultisigSecretByName(
      participantName,
    )
    Assert.isNotUndefined(secretValue)
    const secret = new multisig.ParticipantSecret(secretValue)
    secret.decryptData(Buffer.from(response.content.round1SecretPackage, 'hex'))
  })

  it('should fail if the named secret does not exist', async () => {
    const participantName = 'name'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName })

    const identity = (
      await routeTest.client.wallet.multisig.getIdentity({ name: participantName })
    ).content.identity
    const otherParticipants = Array.from({ length: 2 }, () => ({
      identity: multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
    }))
    const participants = [{ identity }, ...otherParticipants]

    const request = { participantName: 'otherName', minSigners: 2, participants }

    await expect(routeTest.client.wallet.multisig.dkg.round1(request)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("Multisig secret with name 'otherName' not found"),
        status: 400,
      }),
    )
  })

  it('should add the named identity if it is not in the list of participants', async () => {
    const participantName = 'name'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName })

    // only pass in one participant
    const participants = [
      {
        identity: multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
      },
    ]

    const request = { participantName, minSigners: 2, participants }

    const response = await routeTest.client.wallet.multisig.dkg.round1(request)

    expect(response.content).toMatchObject({
      round1SecretPackage: expect.any(String),
      round1PublicPackage: expect.any(String),
    })
  })

  it('should fail if minSigners is too low', async () => {
    const participantName = 'name'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName })

    const identity = (
      await routeTest.client.wallet.multisig.getIdentity({ name: participantName })
    ).content.identity
    const otherParticipants = Array.from({ length: 2 }, () => ({
      identity: multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
    }))
    const participants = [{ identity }, ...otherParticipants]

    const request = { participantName, minSigners: 1, participants }

    await expect(routeTest.client.wallet.multisig.dkg.round1(request)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('minSigners must be 2 or greater, got 1'),
        status: 400,
      }),
    )
  })

  it('should fail if minSigners exceeds the number of participants', async () => {
    const participantName = 'name'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName })

    const identity = (
      await routeTest.client.wallet.multisig.getIdentity({ name: participantName })
    ).content.identity
    const otherParticipants = Array.from({ length: 2 }, () => ({
      identity: multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
    }))
    const participants = [{ identity }, ...otherParticipants]

    const request = { participantName, minSigners: 4, participants }

    await expect(routeTest.client.wallet.multisig.dkg.round1(request)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          'minSigners (4) exceeds the number of participants (3)',
        ),
        status: 400,
      }),
    )
  })
})
