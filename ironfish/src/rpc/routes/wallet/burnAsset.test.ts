/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  useAccountFixture,
  useMintBlockFixture,
  usePostTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'

describe('burnAsset', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('account', true)
  })

  describe('with no default account', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.burnAsset({
          account: 'fake-account',
          assetId: '{ url: hello }',
          fee: '1',
          value: '1',
        }),
      ).rejects.toThrow('No account found with name fake-account')
    })
  })

  describe('with an invalid fee', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.burnAsset({
          account: 'account',
          assetId: '{ url: hello }',
          fee: '0',
          value: '100',
        }),
      ).rejects.toThrow('Invalid transaction fee')
    })
  })

  describe('with an invalid value', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.burnAsset({
          account: 'account',
          assetId: '{ url: hello }',
          fee: '1',
          value: '-1',
        }),
      ).rejects.toThrow('Invalid burn amount')
    })
  })

  describe('with valid parameters', () => {
    it('returns the asset identifier and transaction hash', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet)

      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const assetId = asset.id()
      const value = BigInt(10)
      const mintBlock = await useMintBlockFixture({ node, account, asset, value, sequence: 3 })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      const burnValue = BigInt(2)
      const burnTransaction = await usePostTxFixture({
        node: node,
        wallet: node.wallet,
        from: account,
        burns: [{ assetId: asset.id(), value: burnValue }],
      })
      jest.spyOn(wallet, 'burn').mockResolvedValueOnce(burnTransaction)

      const response = await routeTest.client.burnAsset({
        account: account.name,
        assetId: assetId.toString('hex'),
        fee: '1',
        value: CurrencyUtils.encode(value),
      })

      expect(response.content).toEqual({
        assetId: asset.id().toString('hex'),
        hash: burnTransaction.hash().toString('hex'),
        value: burnTransaction.burns[0].value.toString(),
      })
    })
  })
})
