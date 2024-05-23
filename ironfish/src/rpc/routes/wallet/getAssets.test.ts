/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../../../testUtilities/matchers'
import { Asset } from '@ironfish/rust-nodejs'
import { FullNode } from '../../../node'
import { Block } from '../../../primitives/block'
import { Transaction } from '../../../primitives/transaction'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AsyncUtils } from '../../../utils'
import { SpendingAccount } from '../../../wallet'
import { AssetStatus } from '../../../wallet'

describe('Route wallet/getAssets', () => {
  const routeTest = createRouteTest()

  const createPendingAsset = async ({
    name,
    value,
    node,
    account,
  }: {
    name: string
    value: bigint
    node: FullNode
    account: SpendingAccount
  }): Promise<{ asset: Asset; pendingMint: Transaction }> => {
    const asset = new Asset(account.publicAddress, name, 'metadata')
    const pendingMint = await usePostTxFixture({
      node,
      wallet: node.wallet,
      from: account,
      mints: [
        {
          creator: asset.creator().toString('hex'),
          name: asset.name().toString(),
          metadata: asset.metadata().toString(),
          value,
        },
      ],
    })

    return { asset, pendingMint }
  }

  const createConfirmedAsset = async ({
    name,
    value,
    node,
    account,
  }: {
    name: string
    value: bigint
    node: FullNode
    account: SpendingAccount
  }): Promise<{ asset: Asset; mintBlock: Block }> => {
    const asset = new Asset(account.publicAddress, name, 'metadata')
    const mintBlock = await useMintBlockFixture({ node, account, asset, value })
    await expect(node.chain).toAddBlock(mintBlock)
    await node.wallet.scan()

    return { asset, mintBlock }
  }

  it('returns a stream of assets the wallet owns', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'accountA')

    const minerBlock = await useMinerBlockFixture(node.chain, undefined, account)
    await expect(node.chain).toAddBlock(minerBlock)

    const { asset: confirmedAsset, mintBlock } = await createConfirmedAsset({
      name: 'account-asset',
      value: BigInt(10),
      node,
      account,
    })
    const { asset: pendingAsset, pendingMint } = await createPendingAsset({
      name: 'pending',
      value: BigInt(10),
      node,
      account,
    })

    const response = routeTest.client.wallet.getAssets({ account: account.name })
    const assets = await AsyncUtils.materialize(response.contentStream())

    expect(assets).toEqual(
      expect.arrayContaining([
        {
          createdTransactionHash: pendingMint.hash().toString('hex'),
          id: pendingAsset.id().toString('hex'),
          metadata: pendingAsset.metadata().toString('hex'),
          name: pendingAsset.name().toString('hex'),
          nonce: pendingAsset.nonce(),
          creator: account.publicAddress,
          owner: account.publicAddress,
          status: AssetStatus.PENDING,
          supply: '0',
          verification: { status: 'unknown' },
        },
        {
          createdTransactionHash: mintBlock.transactions[1].hash().toString('hex'),
          id: confirmedAsset.id().toString('hex'),
          metadata: confirmedAsset.metadata().toString('hex'),
          name: confirmedAsset.name().toString('hex'),
          nonce: confirmedAsset.nonce(),
          creator: account.publicAddress,
          owner: account.publicAddress,
          status: AssetStatus.CONFIRMED,
          supply: '10',
          verification: { status: 'unknown' },
        },
      ]),
    )
  })

  it('includes asset verification information', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet, 'accountA')

    const minerBlock = await useMinerBlockFixture(node.chain, undefined, account)
    await expect(node.chain).toAddBlock(minerBlock)

    const { asset: verifiedAsset, mintBlock: mintBlock1 } = await createConfirmedAsset({
      name: 'asset-1',
      value: BigInt(123),
      node,
      account,
    })
    const { asset: unverifiedAsset, mintBlock: mintBlock2 } = await createConfirmedAsset({
      name: 'asset-2',
      value: BigInt(456),
      node,
      account,
    })

    const verifyAsset = jest
      .spyOn(node.assetsVerifier, 'verify')
      .mockImplementation((assetId) => {
        if (!(typeof assetId === 'string')) {
          assetId = assetId.toString('hex')
        }
        if (assetId === verifiedAsset.id().toString('hex')) {
          return { status: 'verified', symbol: 'FOO' }
        } else {
          return { status: 'unverified' }
        }
      })

    const response = routeTest.client.wallet.getAssets({ account: account.name })
    const assets = await AsyncUtils.materialize(response.contentStream())

    expect(verifyAsset).toHaveBeenCalledWith(verifiedAsset.id())
    expect(verifyAsset).toHaveBeenCalledWith(unverifiedAsset.id())

    expect(assets).toEqual(
      expect.arrayContaining([
        {
          createdTransactionHash: mintBlock2.transactions[1].hash().toString('hex'),
          id: unverifiedAsset.id().toString('hex'),
          metadata: unverifiedAsset.metadata().toString('hex'),
          name: unverifiedAsset.name().toString('hex'),
          nonce: unverifiedAsset.nonce(),
          creator: account.publicAddress,
          owner: account.publicAddress,
          status: AssetStatus.CONFIRMED,
          supply: '456',
          verification: { status: 'unverified' },
        },
        {
          createdTransactionHash: mintBlock1.transactions[1].hash().toString('hex'),
          id: verifiedAsset.id().toString('hex'),
          metadata: verifiedAsset.metadata().toString('hex'),
          name: verifiedAsset.name().toString('hex'),
          nonce: verifiedAsset.nonce(),
          creator: account.publicAddress,
          owner: account.publicAddress,
          status: AssetStatus.CONFIRMED,
          supply: '123',
          verification: { status: 'verified', symbol: 'FOO' },
        },
      ]),
    )
  })
})
