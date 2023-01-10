/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import {
  useAccountFixture,
  useBurnBlockFixture,
  useMinerBlockFixture,
  useMintBlockFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('getBalances', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('account', true)
  })

  describe('with a missing account', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client
          .request('wallet/getBalances', { account: 'fake-account' })
          .waitForEnd(),
      ).rejects.toThrow(`No account found with name 'fake-account'`)
    })
  })

  describe('with a valid account', () => {
    it('streams balances for all assets owned by the account', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet)

      const mined = await useMinerBlockFixture(node.chain, 2, account)
      await expect(node.chain).toAddBlock(mined)
      await node.wallet.updateHead()

      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const assetId = asset.id()
      const mintValue = BigInt(10)
      const mintBlock = await useMintBlockFixture({
        node,
        account,
        asset,
        value: mintValue,
        sequence: 3,
      })
      await expect(node.chain).toAddBlock(mintBlock)
      await node.wallet.updateHead()

      const burnValue = BigInt(2)
      const burnBlock = await useBurnBlockFixture({
        node: node,
        account,
        asset,
        value: burnValue,
        sequence: 4,
      })
      await expect(node.chain).toAddBlock(burnBlock)
      await node.wallet.updateHead()

      const response = routeTest.client.getAccountBalances({
        account: account.name,
      })

      const balances = new BufferMap<{
        confirmed: bigint
        unconfirmed: bigint
        unconfirmedCount: number
      }>()
      for await (const {
        assetId,
        confirmed,
        unconfirmed,
        unconfirmedCount,
      } of response.contentStream()) {
        balances.set(Buffer.from(assetId, 'hex'), {
          confirmed: BigInt(confirmed),
          unconfirmed: BigInt(unconfirmed),
          unconfirmedCount,
        })
      }

      const expectedBalances = new BufferMap<{
        confirmed: bigint
        unconfirmed: bigint
        unconfirmedCount: number
      }>([
        [
          Asset.nativeId(),
          {
            confirmed: BigInt(2000000000),
            unconfirmed: BigInt(2000000000),
            unconfirmedCount: 0,
          },
        ],
        [
          assetId,
          {
            confirmed: mintValue - burnValue,
            unconfirmed: mintValue - burnValue,
            unconfirmedCount: 0,
          },
        ],
      ])
      expect(balances).toEqual(expectedBalances)
    })
  })
})
