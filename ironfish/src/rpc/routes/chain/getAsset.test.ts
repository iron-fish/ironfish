/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../../../testUtilities/matchers'
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'

describe('Route chain.getAsset', () => {
  const routeTest = createRouteTest()

  it('responds with an asset', async () => {
    const asset = await routeTest.node.chain.getAssetById(Asset.nativeId())
    Assert.isNotNull(asset)

    const response = await routeTest.client.chain.getAsset({
      id: asset.id.toString('hex'),
    })

    expect(response.content.id).toEqual(asset.id.toString('hex'))
    expect(response.content.metadata).toBe(asset.metadata.toString('hex'))
    expect(response.content.nonce).toBe(asset.nonce)
    expect(response.content.creator).toBe(asset.creator.toString('hex'))
    expect(response.content.owner).toBe(asset.owner.toString('hex'))
    expect(response.content.supply).toBe(CurrencyUtils.encode(asset.supply))
    expect(response.content.createdTransactionHash).toBe(
      asset.createdTransactionHash.toString('hex'),
    )
  })
})
