/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../../../testUtilities/matchers'
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { BlockHashSerdeInstance } from '../../../serde'
import {
  useAccountFixture,
  useBurnBlockFixture,
  useMintBlockFixture,
} from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { MemoryResponse } from '../../adapters'

describe('Route chain.getTransactionStream', () => {
  const routeTest = createRouteTest()

  it(`should fail if block can't be found with hash`, async () => {
    const hash = BlockHashSerdeInstance.serialize(Buffer.alloc(32, 'blockhashnotfound'))
    const wallet = routeTest.node.wallet
    const account = await useAccountFixture(wallet)

    await expect(
      routeTest.client
        .request('chain/getTransactionStream', {
          incomingViewKey: account.incomingViewKey,
          head: hash,
        })
        .waitForEnd(),
    ).rejects.toThrow(
      `Request failed (400) validation: Block with hash ${hash} was not found in the chain`,
    )
  })

  it('returns expected mints and burns', async () => {
    const wallet = routeTest.node.wallet
    const account = await useAccountFixture(wallet)
    const asset = new Asset(account.publicAddress, 'customasset', 'metadata')
    const response = routeTest.client.chain.getTransactionStream({
      incomingViewKey: account.incomingViewKey,
    })
    Assert.isInstanceOf(response, MemoryResponse)
    await response.contentStream().next()
    // Mint so we have an existing asset
    const mintValue = BigInt(10)

    const mintBlock = await useMintBlockFixture({
      node: routeTest.node,
      account,
      asset,
      value: mintValue,
    })

    await expect(routeTest.node.chain).toAddBlock(mintBlock)
    // validate mint block
    expect((await response.contentStream().next()).value).toEqual(
      expect.objectContaining({
        transactions: expect.arrayContaining([
          expect.objectContaining({
            mints: expect.arrayContaining([expect.objectContaining({ value: '10' })]),
          }),
        ]),
      }),
    )

    // update wallet so it sees newly added asset
    await wallet.scan()

    // now burn
    const burnBlock = await useBurnBlockFixture({
      node: routeTest.node,
      account,
      asset,
      value: mintValue,
    })
    await expect(routeTest.node.chain).toAddBlock(burnBlock)

    // validate burn block
    expect((await response.contentStream().next()).value).toEqual(
      expect.objectContaining({
        transactions: expect.arrayContaining([
          expect.objectContaining({
            burns: expect.arrayContaining([expect.objectContaining({ value: '10' })]),
          }),
        ]),
      }),
    )

    response.close()
  })
})
