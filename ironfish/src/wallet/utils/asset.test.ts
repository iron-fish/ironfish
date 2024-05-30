/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
} from '../../testUtilities'
import { AssetStatus, getAssetStatus } from './asset'

describe('Wallet Asset Utils', () => {
  const nodeTest = createNodeTest()

  describe('getAssetStatus', () => {
    it('should return the correct status for assets', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.publicAddress, 'asset', 'metadata')
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account,
        asset,
        value,
      })

      let assetValue = await node.wallet.walletDb.getAsset(account, asset.id())
      Assert.isNotUndefined(assetValue)

      // Check status before added to a block
      expect(
        await getAssetStatus(account, assetValue, node.config.get('confirmations')),
      ).toEqual(AssetStatus.PENDING)

      // Add to a block and check different confirmation ranges
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()
      assetValue = await node.wallet.walletDb.getAsset(account, asset.id())
      Assert.isNotUndefined(assetValue)
      expect(
        await getAssetStatus(account, assetValue, node.config.get('confirmations')),
      ).toEqual(AssetStatus.CONFIRMED)
      expect(await getAssetStatus(account, assetValue, 2)).toEqual(AssetStatus.UNCONFIRMED)

      // Remove the head and check status
      jest.spyOn(account, 'getHead').mockResolvedValueOnce(Promise.resolve(null))
      expect(
        await getAssetStatus(account, assetValue, node.config.get('confirmations')),
      ).toEqual(AssetStatus.UNKNOWN)
    })
  })
})
