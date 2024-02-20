/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../../testUtilities/routeTest'

describe('Route multisig/createTrustedDealerKeyPackage', () => {
  const routeTest = createRouteTest()

  it('should create trusted dealer key package', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identity: ParticipantSecret.random().toIdentity().serialize().toString('hex'),
    }))
    const request = { minSigners: 2, participants }
    const response = await routeTest.client
      .request('wallet/multisig/createTrustedDealerKeyPackage', request)
      .waitForEnd()

    expect(response.content).toMatchObject({
      incomingViewKey: expect.any(String),
      keyPackages: expect.arrayContaining([
        {
          identity: participants[0].identity,
          keyPackage: expect.any(String),
        },
        {
          identity: participants[1].identity,
          keyPackage: expect.any(String),
        },
        {
          identity: participants[2].identity,
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
