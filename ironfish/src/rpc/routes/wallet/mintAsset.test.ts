/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { useAccountFixture, useMinerBlockFixture, useTxFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'
import { serializeRpcWalletTransaction } from './serializers'

describe('Route wallet/mintAsset', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('account', { setDefault: true })
  })

  describe('with an invalid fee', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.wallet.mintAsset({
          account: 'account',
          fee: '0',
          metadata: '{ url: hello }',
          name: 'fake-coin',
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
        routeTest.client.wallet.mintAsset({
          account: 'account',
          fee: '1',
          metadata: '{ url: hello }',
          name: 'fake-coin',
          value: '-1',
        }),
      ).rejects.toThrow(
        'Request failed (400) validation: value must be equal to or greater than 0',
      )
    })
  })

  describe('with an invalid transferOwnershipTo', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.wallet.mintAsset({
          account: 'account',
          fee: '1',
          metadata: '{ url: hello }',
          name: 'fake-coin',
          value: '100',
          transferOwnershipTo: 'abcdefghijklmnopqrstuvwxyz',
        }),
      ).rejects.toThrow(
        'Request failed (400) validation: transferOwnershipTo must be a valid public address',
      )
    })
  })

  describe('with valid parameters', () => {
    it('returns the asset identifier and transaction hash', async () => {
      const node = routeTest.node
      node.chain.consensus.parameters.enableAssetOwnership = 1
      const wallet = node.wallet
      const account = await useAccountFixture(wallet)
      const accountB = await useAccountFixture(wallet, 'accountB')

      const block = await useMinerBlockFixture(routeTest.chain, undefined, account, node.wallet)
      await expect(node.chain).toAddBlock(block)
      await node.wallet.scan()

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const newOwner = accountB.publicAddress
      const mintData = {
        creator: asset.creator().toString('hex'),
        name: asset.name().toString('utf8'),
        metadata: asset.metadata().toString('utf8'),
        value: 10n,
        isNewAsset: true,
        transferOwnershipTo: newOwner,
      }

      const mintTransaction = await useTxFixture(wallet, account, account, async () => {
        const raw = await wallet.createTransaction({
          account,
          mints: [mintData],
          fee: 0n,
          expiration: 0,
        })
        const { transaction } = await wallet.post({
          transaction: raw,
          account,
        })
        return transaction
      })

      jest.spyOn(wallet, 'mint').mockResolvedValueOnce(mintTransaction)

      const accountAsset = await account.getAsset(asset.id())

      Assert.isNotUndefined(accountAsset)

      const response = await routeTest.client.wallet.mintAsset({
        account: account.name,
        fee: '1',
        metadata: asset.metadata().toString('utf8'),
        name: asset.name().toString('utf8'),
        value: CurrencyUtils.encode(mintData.value),
        transferOwnershipTo: newOwner,
      })

      const walletTransaction = await account.getTransaction(mintTransaction.hash())
      Assert.isNotUndefined(walletTransaction)

      expect(response.content).toEqual({
        asset: {
          id: asset.id().toString('hex'),
          metadata: asset.metadata().toString('hex'),
          name: asset.name().toString('hex'),
          creator: asset.creator().toString('hex'),
          nonce: asset.nonce(),
          supply: undefined,
          owner: accountAsset.owner.toString('hex'),
          createdTransactionHash: accountAsset.createdTransactionHash.toString('hex'),
          status: await node.wallet.getAssetStatus(account, accountAsset, {
            confirmations: 0,
          }),
          verification: node.assetsVerifier.verify(asset.id()),
        },
        transaction: await serializeRpcWalletTransaction(
          node.config,
          node.wallet,
          account,
          walletTransaction,
        ),
        id: asset.id().toString('hex'),
        creator: asset.creator().toString('hex'),
        owner: asset.creator().toString('hex'),
        assetId: asset.id().toString('hex'),
        metadata: asset.metadata().toString('hex'),
        hash: mintTransaction.hash().toString('hex'),
        name: asset.name().toString('hex'),
        assetName: asset.name().toString('hex'),
        value: mintTransaction.mints[0].value.toString(),
        transferOwnershipTo: newOwner,
      })
    })
  })
})
