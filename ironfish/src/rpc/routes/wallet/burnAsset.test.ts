/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import {
  useAccountFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
  usePostTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'
import { serializeRpcWalletTransaction } from './serializers'

describe('Route wallet/burnAsset', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('account', { setDefault: true })
  })

  describe('with an invalid fee', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.wallet.burnAsset({
          account: 'account',
          assetId: '{ url: hello }',
          fee: '0',
          value: '100',
        }),
      ).rejects.toThrow(
        'Request failed (400) validation: value must be equal to or greater than 1',
      )
    })
  })

  describe('with an invalid value', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.wallet.burnAsset({
          account: 'account',
          assetId: '{ url: hello }',
          fee: '1',
          value: '-1',
        }),
      ).rejects.toThrow(
        'Request failed (400) validation: value must be equal to or greater than 1',
      )
    })
  })

  describe('with valid parameters', () => {
    it('returns the asset identifier and transaction hash', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet)

      const block = await useMinerBlockFixture(routeTest.chain, undefined, account, node.wallet)
      await expect(node.chain).toAddBlock(block)
      await node.wallet.scan()

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const assetId = asset.id()
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.scan()

      const burnValue = BigInt(2)
      const burnTransaction = await usePostTxFixture({
        node: node,
        wallet: node.wallet,
        from: account,
        burns: [{ assetId: asset.id(), value: burnValue }],
      })
      jest.spyOn(wallet, 'burn').mockResolvedValueOnce(burnTransaction)

      const accountAsset = await account.getAsset(assetId)

      Assert.isNotUndefined(accountAsset)

      const response = await routeTest.client.wallet.burnAsset({
        account: account.name,
        assetId: assetId.toString('hex'),
        fee: '1',
        value: CurrencyUtils.encode(value),
      })

      const walletTransaction = await account.getTransaction(burnTransaction.hash())
      Assert.isNotUndefined(walletTransaction)

      expect(response.content).toEqual({
        asset: {
          id: asset.id().toString('hex'),
          metadata: asset.metadata().toString('hex'),
          name: asset.name().toString('hex'),
          creator: asset.creator().toString('hex'),
          nonce: accountAsset.nonce ?? null,
          owner: accountAsset.owner.toString('hex') ?? '',
          status: await node.wallet.getAssetStatus(account, accountAsset, {
            confirmations: 0,
          }),
          verification: node.assetsVerifier.verify(asset.id()),
          createdTransactionHash: accountAsset.createdTransactionHash.toString('hex') ?? null,
        },
        transaction: await serializeRpcWalletTransaction(
          node.config,
          node.wallet,
          account,
          walletTransaction,
        ),
        id: asset.id().toString('hex'),
        assetId: asset.id().toString('hex'),
        name: asset.name().toString('hex'),
        assetName: asset.name().toString('hex'),
        hash: burnTransaction.hash().toString('hex'),
        value: burnTransaction.burns[0].value.toString(),
      })
    })
  })
})
