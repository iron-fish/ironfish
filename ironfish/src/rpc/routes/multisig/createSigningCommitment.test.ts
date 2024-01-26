/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ParticipantSecret, TrustedDealerKeyPackages } from '@ironfish/rust-nodejs'
import { v4 as uuid } from 'uuid'
import { Assert } from '../../../assert'
import { createNodeTest } from '../../../testUtilities'
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
    const seed = 420
    const nodeTest = createNodeTest()
    const { node } = await nodeTest.createSetup()

    const participants: { identifier: string }[] = []
    for (let i = 0; i < 3; i++) {
      const identifier = ParticipantSecret.random().toIdentity().toFrostIdentifier()
      participants.push({
        identifier: identifier,
      })
    }
    const request = { minSigners: 2, maxSigners: 3, participants }
    const response = await routeTest.client
      .request('multisig/createTrustedDealerKeyPackage', request)
      .waitForEnd()

    const trustedDealerPackage = response.content as TrustedDealerKeyPackages

    const getMultiSigKeys = (index: number) => {
      return {
        identifier: trustedDealerPackage.keyPackages[index].identifier,
        keyPackage: trustedDealerPackage.keyPackages[index].keyPackage,
        proofGenerationKey: trustedDealerPackage.proofGenerationKey,
      }
    }

    const participantA = await node.wallet.importAccount({
      version: 2,
      id: uuid(),
      name: trustedDealerPackage.keyPackages[0].identifier,
      spendingKey: null,
      createdAt: null,
      multiSigKeys: getMultiSigKeys(0),
      ...trustedDealerPackage,
    })
    const participantB = await node.wallet.importAccount({
      version: 2,
      id: uuid(),
      name: trustedDealerPackage.keyPackages[1].identifier,
      spendingKey: null,
      createdAt: null,
      multiSigKeys: getMultiSigKeys(1),
      ...trustedDealerPackage,
    })
    const participantC = await node.wallet.importAccount({
      version: 2,
      id: uuid(),
      name: trustedDealerPackage.keyPackages[2].identifier,
      spendingKey: null,
      createdAt: null,
      multiSigKeys: getMultiSigKeys(2),
      ...trustedDealerPackage,
    })

    Assert.isNotUndefined(participantA.multiSigKeys)
    Assert.isNotUndefined(participantB.multiSigKeys)
    Assert.isNotUndefined(participantC.multiSigKeys)

    const signingCommitment = await routeTest.client
      .request('multisig/createSigningCommitment', {
        keyPackage: participantA.multiSigKeys.keyPackage,
        seed,
      })
      .waitForEnd()

    expect(signingCommitment.content).toMatchObject({
      hiding: expect.any(String),
      binding: expect.any(String),
    })
  })
})
