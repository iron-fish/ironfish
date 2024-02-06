/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route multisig/createSigningCommitment', () => {
  const routeTest = createRouteTest()

  it('should error on invalid keypackage', async () => {
    const keyPackage = 'invalid key package'
    const request = { keyPackage, seed: 0 }
    await expect(
      routeTest.client.request('multisig/createSigningCommitment', request).waitForEnd(),
    ).rejects.toThrow('InvalidData')
  })

  it('should create signing commitment', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identifier: ParticipantSecret.random().toIdentity().toFrostIdentifier(),
    }))

    const request = { minSigners: 2, participants }
    const response = await routeTest.client.multisig.createTrustedDealerKeyPackage(request)

    const trustedDealerPackage = response.content

    const signingCommitment = await routeTest.client
      .request('multisig/createSigningCommitment', {
        keyPackage: trustedDealerPackage.keyPackages[0].keyPackage,
        seed: 420,
      })
      .waitForEnd()

    expect(signingCommitment.content).toMatchObject({
      commitment: expect.any(String),
    })
  })
})
