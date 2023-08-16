/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { useAccountFixture, useTxFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'

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
        'Request failed (400) validation: value must be equal to or greater than 1',
      )
    })
  })

  describe('with valid parameters', () => {
    it('returns the asset identifier and transaction hash', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet)

      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const mintData = {
        name: asset.name().toString('utf8'),
        metadata: asset.metadata().toString('utf8'),
        value: 10n,
        isNewAsset: true,
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

      const response = await routeTest.client.wallet.mintAsset({
        account: account.name,
        fee: '1',
        metadata: asset.metadata().toString('utf8'),
        name: asset.name().toString('utf8'),
        value: CurrencyUtils.encode(mintData.value),
      })

      expect(response.content).toEqual({
        assetId: asset.id().toString('hex'),
        hash: mintTransaction.hash().toString('hex'),
        name: asset.name().toString('hex'),
        value: mintTransaction.mints[0].value.toString(),
      })
    })
  })
})
