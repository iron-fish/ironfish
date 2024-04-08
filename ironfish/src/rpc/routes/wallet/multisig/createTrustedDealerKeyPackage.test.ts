/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import { createRouteTest } from '../../../../testUtilities/routeTest'

describe('Route multisig/createTrustedDealerKeyPackage', () => {
  const routeTest = createRouteTest()

  it('should create trusted dealer key package', async () => {
    const participants = Array.from({ length: 3 }, () => ({
      identity: multisig.ParticipantSecret.random().toIdentity().serialize().toString('hex'),
    }))
    const request = { minSigners: 2, participants }
    const response = await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage(
      request,
    )

    expect(response.content).toMatchObject({
      publicAddress: expect.any(String),
      publicKeyPackage: expect.any(String),
      viewKey: expect.any(String),
      incomingViewKey: expect.any(String),
      outgoingViewKey: expect.any(String),
      proofAuthorizingKey: expect.any(String),
      participantAccounts: expect.arrayContaining([
        {
          identity: participants[0].identity,
          account: expect.any(String),
        },
        {
          identity: participants[1].identity,
          account: expect.any(String),
        },
        {
          identity: participants[2].identity,
          account: expect.any(String),
        },
      ]),
    })
  })
})
