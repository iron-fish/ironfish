/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../../../testUtilities/routeTest'

describe('Route multisig/dkg/round2', () => {
  const routeTest = createRouteTest()

  it('should create round 2 packages', async () => {
    const participantName1 = 'name1'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName1 })
    const participantName2 = 'name2'
    await routeTest.client.wallet.multisig.createParticipant({ name: participantName2 })

    const identity1 = (
      await routeTest.client.wallet.multisig.getIdentity({ name: participantName1 })
    ).content.identity
    const identity2 = (
      await routeTest.client.wallet.multisig.getIdentity({ name: participantName2 })
    ).content.identity
    const participants = [{ identity: identity1 }, { identity: identity2 }]

    const round1Request1 = { participantName: participantName1, minSigners: 2, participants }
    const round1Response1 = await routeTest.client.wallet.multisig.dkg.round1(round1Request1)

    const round1Request2 = { participantName: participantName2, minSigners: 2, participants }
    const round1Response2 = await routeTest.client.wallet.multisig.dkg.round1(round1Request2)

    const round2Request = {
      participantName: participantName1,
      round1SecretPackage: round1Response1.content.round1SecretPackage,
      round1PublicPackages: [
        round1Response1.content.round1PublicPackage,
        round1Response2.content.round1PublicPackage,
      ],
    }

    const round2Response = await routeTest.client.wallet.multisig.dkg.round2(round2Request)

    expect(round2Response.content).toMatchObject({
      round2SecretPackage: expect.any(String),
    })
  })

  it('should fail if the named secret does not exist', async () => {
    const request = {
      participantName: 'fakeName',
      round1SecretPackage: 'foo',
      round1PublicPackages: ['bar', 'baz'],
    }

    await expect(routeTest.client.wallet.multisig.dkg.round2(request)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("Multisig secret with name 'fakeName' not found"),
        status: 400,
      }),
    )
  })
})
