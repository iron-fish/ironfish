/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { createNodeTest, useAccountFixture } from '../../testUtilities'
import { AssetValue, AssetValueEncoding } from './assetValue'

describe('AssetValueEncoding', () => {
  const nodeTest = createNodeTest()

  it('serializes the value into a buffer and deserializes to the original value', async () => {
    const account = await useAccountFixture(nodeTest.wallet)
    const asset = new Asset(account.publicAddress, 'asset', 'metadata')
    const encoder = new AssetValueEncoding()

    const value: AssetValue = {
      createdTransactionHash: Buffer.alloc(32, 0),
      id: asset.id(),
      metadata: asset.metadata(),
      name: asset.name(),
      nonce: asset.nonce(),
      creator: asset.creator(),
      owner: asset.creator(),
      supply: BigInt(100),
    }
    const buffer = encoder.serialize(value)
    const deserializedValue = encoder.deserialize(buffer)
    expect(deserializedValue).toEqual(value)
  })
})
