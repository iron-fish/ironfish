/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRouteTest } from '../../../../../testUtilities/routeTest'

describe('Route multisig/dkg/round2', () => {
  const routeTest = createRouteTest()

  it('should create round 2 packages', async () => {
    const secretName1 = 'name1'
    await routeTest.client.wallet.multisig.createParticipant({ name: secretName1 })
    const secretName2 = 'name2'
    await routeTest.client.wallet.multisig.createParticipant({ name: secretName2 })

    const identity1 = (
      await routeTest.client.wallet.multisig.getIdentity({ name: secretName1 })
    ).content.identity
    const identity2 = (
      await routeTest.client.wallet.multisig.getIdentity({ name: secretName2 })
    ).content.identity
    const participants = [{ identity: identity1 }, { identity: identity2 }]

    const round1Request1 = { secretName: secretName1, minSigners: 2, participants }
    const round1Response1 = await routeTest.client.wallet.multisig.dkg.round1(round1Request1)

    const round1Request2 = { secretName: secretName2, minSigners: 2, participants }
    const round1Response2 = await routeTest.client.wallet.multisig.dkg.round1(round1Request2)

    const round2Request = {
      secretName: secretName1,
      encryptedSecretPackage: round1Response1.content.encryptedSecretPackage,
      publicPackages: [
        round1Response1.content.publicPackage,
        round1Response2.content.publicPackage,
      ],
    }

    const round2Response = await routeTest.client.wallet.multisig.dkg.round2(round2Request)

    expect(round2Response.content).toMatchObject({
      encryptedSecretPackage: expect.any(String),
    })
  })

  it('should fail if the named secret does not exist', async () => {
    const request = {
      secretName: 'fakeName',
      encryptedSecretPackage: 'foo',
      publicPackages: ['bar', 'baz'],
    }

    await expect(routeTest.client.wallet.multisig.dkg.round2(request)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining("Multisig secret with name 'fakeName' not found"),
        status: 400,
      }),
    )
  })
})
