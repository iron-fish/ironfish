/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../../../testUtilities/matchers'
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Block, Transaction } from '../../../primitives'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { AssetStatus, SpendingAccount } from '../../../wallet'

describe('Route chain.getAsset', () => {
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

  it('throws a validation error for an invalid length', async () => {
    const account = await useAccountFixture(routeTest.node.wallet)
    await expect(
      routeTest.client.wallet.getAsset({
        id: Buffer.alloc(10).toString('hex'),
        account: account.name,
      }),
    ).rejects.toThrow(
      'Request failed (400) validation: Asset identifier is invalid length, expected 32 but got 10',
    )
  })

  it('throws a not found error for a missing asset', async () => {
    const account = await useAccountFixture(routeTest.node.wallet)
    await expect(
      routeTest.client.wallet.getAsset({
        id: Buffer.alloc(32).toString('hex'),
        account: account.name,
      }),
    ).rejects.toThrow(
      'Request failed (404) not-found: No asset found with identifier 0000000000000000000000000000000000000000000000000000000000000000',
    )
  })

  it('responds with pending asset fields for a valid request', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet)

    const minerBlock = await useMinerBlockFixture(node.chain, undefined, account)
    await expect(node.chain).toAddBlock(minerBlock)

    await node.wallet.scan()

    const value = 10n
    const { asset, pendingMint } = await createPendingAsset({
      account,
      name: 'name',
      node,
      value,
    })

    const response = await routeTest.client.wallet.getAsset({
      id: asset.id().toString('hex'),
      account: account.name,
    })

    const accountAsset = await account.getAsset(asset.id())

    Assert.isNotUndefined(accountAsset)

    expect(response.content).toEqual({
      createdTransactionHash: pendingMint.hash().toString('hex'),
      creator: account.publicAddress,
      owner: account.publicAddress,
      id: asset.id().toString('hex'),
      metadata: asset.metadata().toString('hex'),
      name: asset.name().toString('hex'),
      nonce: asset.nonce(),
      status: await node.wallet.getAssetStatus(account, accountAsset, {
        confirmations: 0,
      }),
      verification: node.assetsVerifier.verify(asset.id()),
    })
  })

  it('responds with confirmed asset fields for a valid request', async () => {
    const node = routeTest.node
    const account = await useAccountFixture(node.wallet)

    const minerBlock = await useMinerBlockFixture(node.chain, undefined, account)
    await expect(node.chain).toAddBlock(minerBlock)

    const value = 10n
    const { asset, mintBlock } = await createConfirmedAsset({
      account,
      name: 'name',
      node,
      value,
    })

    const response = await routeTest.client.wallet.getAsset({
      id: asset.id().toString('hex'),
      account: account.name,
    })
    expect(response.content).toEqual({
      createdTransactionHash: mintBlock.transactions[1].hash().toString('hex'),
      creator: account.publicAddress,
      owner: account.publicAddress,
      id: asset.id().toString('hex'),
      metadata: asset.metadata().toString('hex'),
      name: asset.name().toString('hex'),
      nonce: asset.nonce(),
      status: AssetStatus.CONFIRMED,
      supply: value.toString(),
      verification: { status: 'unknown' },
    })
  })
})
