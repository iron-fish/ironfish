/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route multisig/createTrustedDealerKeyPackage', () => {
  const routeTest = createRouteTest()

  it('should create trusted dealer key package', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identifier: ParticipantSecret.random().toIdentity().toFrostIdentifier(),
    }))
    const request = { minSigners: 2, participants }
    const response = await routeTest.client
      .request('multisig/createTrustedDealerKeyPackage', request)
      .waitForEnd()

    expect(response.content).toMatchObject({
      incomingViewKey: expect.any(String),
      keyPackages: expect.arrayContaining([
        {
          identifier: participants[0].identifier,
          keyPackage: expect.any(String),
        },
        {
          identifier: participants[1].identifier,
          keyPackage: expect.any(String),
        },
        {
          identifier: participants[2].identifier,
          keyPackage: expect.any(String),
        },
      ]),
      outgoingViewKey: expect.any(String),
      proofAuthorizingKey: expect.any(String),
      publicAddress: expect.any(String),
      publicKeyPackage: expect.any(String),
      verifyingKey: expect.any(String),
      viewKey: expect.any(String),
    })
  })
})
