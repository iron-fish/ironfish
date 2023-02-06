/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../../../testUtilities/matchers'
import { Asset } from '@ironfish/rust-nodejs'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AsyncUtils } from '../../../utils'
import { AssetStatus } from '../../../wallet'

describe('wallet/getAssets', () => {
  const routeTest = createRouteTest()

  it('returns a stream of assets the wallet owns', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'accountA')

    const minerBlock = await useMinerBlockFixture(node.chain, undefined, account)
    await expect(node.chain).toAddBlock(minerBlock)

    const asset = new Asset(account.spendingKey, 'account-asset', 'metadata')
    const value = BigInt(10)
    const mintBlock = await useMintBlockFixture({ node, account, asset, value })
    await expect(node.chain).toAddBlock(mintBlock)
    await node.wallet.updateHead()

    const pendingAsset = new Asset(account.spendingKey, 'pending', 'metadata')
    const pendingMint = await usePostTxFixture({
      node,
      wallet: node.wallet,
      from: account,
      mints: [
        {
          name: pendingAsset.name().toString('hex'),
          metadata: pendingAsset.metadata().toString('hex'),
          value,
        },
      ],
    })

    const response = routeTest.client.getAssets({ account: account.name })

    const assets = await AsyncUtils.materialize(response.contentStream())
    expect(assets).toEqual([
      {
        createdTransactionHash: pendingMint.hash().toString('hex'),
        id: pendingAsset.id().toString('hex'),
        metadata: pendingAsset.metadata().toString('hex'),
        name: pendingAsset.name().toString('hex'),
        owner: account.publicAddress,
        status: AssetStatus.PENDING,
        supply: undefined,
      },
      {
        createdTransactionHash: mintBlock.transactions[1].hash().toString('hex'),
        id: asset.id().toString('hex'),
        metadata: asset.metadata().toString('hex'),
        name: asset.name().toString('hex'),
        owner: account.publicAddress,
        status: AssetStatus.CONFIRMED,
        supply: value.toString(),
      },
    ])
  })
})
