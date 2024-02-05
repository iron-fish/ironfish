/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Commitment, ParticipantSecret } from '@ironfish/rust-nodejs'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useUnsignedTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route multisig/createSigningPackage', () => {
  const routeTest = createRouteTest()
  const nodeTest = createNodeTest()

  it('should create signing package', async () => {
    const seed = 420

    const participants = Array.from({ length: 3 }, () => ({
      identifier: ParticipantSecret.random().toIdentity().toFrostIdentifier(),
    }))

    const request = {
      minSigners: 2,
      participants,
    }
    const response = await routeTest.client.multisig.createTrustedDealerKeyPackage(request)

    const trustedDealerPackage = response.content

    const commitments: Array<Commitment> = []
    for (let i = 0; i < 3; i++) {
      const signingCommitment = await routeTest.client.multisig.createSigningCommitment({
        keyPackage: trustedDealerPackage.keyPackages[i].keyPackage,
        seed,
      })
      commitments.push(signingCommitment.content)
    }

    const account = await useAccountFixture(nodeTest.wallet)

    // fund account
    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await nodeTest.chain.addBlock(block)
    await nodeTest.wallet.updateHead()

    const unsignedTransaction = await useUnsignedTxFixture(nodeTest.wallet, account, account)
    const unsignedString = unsignedTransaction.serialize().toString('hex')
    const responseSigningPackage = await routeTest.client.multisig.createSigningPackage({
      commitments,
      unsignedTransaction: unsignedString,
    })

    expect(responseSigningPackage.content).toMatchObject({
      signingPackage: expect.any(String),
    })
  })
})
