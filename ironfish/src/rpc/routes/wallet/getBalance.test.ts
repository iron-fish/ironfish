/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getBalance', () => {
  const routeTest = createRouteTest(true)

  describe('with a missing account', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.wallet.getAccountBalance({ account: 'fake-account' }),
      ).rejects.toThrow('No account with name fake-account')
    })
  })

  describe('with a valid account', () => {
    it('returns balance of the native asset', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet, 'accountA')

      const getBalances = jest
        .spyOn(wallet, 'getBalance')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementationOnce(async (_account, _assetId, _options?) => {
          return {
            assetId: Asset.nativeId(),
            assetName: Buffer.from('$IRON', 'utf8'),
            assetCreator: Buffer.from('Iron Fish', 'utf8'),
            assetOwner: Buffer.from('Copper Clam', 'utf8'),
            assetVerification: { status: 'unknown' },
            confirmed: BigInt(2000000000),
            unconfirmed: BigInt(2000000000),
            pending: BigInt(2000000000),
            available: BigInt(2000000000),
            availableNoteCount: 1,
            unconfirmedCount: 0,
            pendingCount: 0,
            blockHash: null,
            sequence: null,
          }
        })

      const response = await routeTest.client.wallet.getAccountBalance({
        account: account.name,
      })

      expect(getBalances).toHaveBeenCalledWith(account, Asset.nativeId(), { confirmations: 0 })
      expect(response.content).toEqual({
        account: account.name,
        assetId: Asset.nativeId().toString('hex'),
        assetVerification: { status: 'unknown' },
        confirmed: '2000000000',
        unconfirmed: '2000000000',
        pending: '2000000000',
        available: '2000000000',
        availableNoteCount: 1,
        unconfirmedCount: 0,
        pendingCount: 0,
        blockHash: null,
        confirmations: 0,
        sequence: null,
      })
    })

    it('returns balance of an arbitrary asset', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet, 'accountB')
      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')

      const getBalances = jest
        .spyOn(wallet, 'getBalance')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementationOnce(async (_account, _assetId, _options?) => {
          return {
            assetId: asset.id(),
            assetName: asset.name(),
            assetCreator: asset.creator(),
            assetOwner: asset.creator(),
            assetVerification: { status: 'unknown' },
            confirmed: BigInt(8),
            unconfirmed: BigInt(8),
            pending: BigInt(8),
            available: BigInt(8),
            availableNoteCount: 1,
            unconfirmedCount: 0,
            pendingCount: 0,
            blockHash: null,
            sequence: null,
          }
        })

      const response = await routeTest.client.wallet.getAccountBalance({
        account: account.name,
        assetId: asset.id().toString('hex'),
      })

      expect(getBalances).toHaveBeenCalledWith(account, asset.id(), { confirmations: 0 })
      expect(response.content).toEqual({
        account: account.name,
        assetId: asset.id().toString('hex'),
        assetVerification: { status: 'unknown' },
        confirmed: '8',
        unconfirmed: '8',
        pending: '8',
        available: '8',
        availableNoteCount: 1,
        unconfirmedCount: 0,
        pendingCount: 0,
        blockHash: null,
        confirmations: 0,
        sequence: null,
      })
    })

    it('returns asset verification information', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet, 'accountC')

      const getBalances = jest
        .spyOn(wallet, 'getBalance')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementationOnce(async (_account, _assetId, _options?) => {
          return {
            assetId: Asset.nativeId(),
            assetName: Buffer.from('$IRON', 'utf8'),
            assetCreator: Buffer.from('Iron Fish', 'utf8'),
            assetOwner: Buffer.from('Copper Clam', 'utf8'),
            assetVerification: { status: 'unknown' },
            confirmed: BigInt(2000000000),
            unconfirmed: BigInt(2000000000),
            pending: BigInt(2000000000),
            available: BigInt(2000000000),
            availableNoteCount: 1,
            unconfirmedCount: 0,
            pendingCount: 0,
            blockHash: null,
            sequence: null,
          }
        })

      const verifyAsset = jest
        .spyOn(node.assetsVerifier, 'verify')
        .mockReturnValueOnce({ status: 'verified', symbol: 'FOO' })

      const response = await routeTest.client.wallet.getAccountBalance({
        account: account.name,
      })

      expect(getBalances).toHaveBeenCalledWith(account, Asset.nativeId(), { confirmations: 0 })
      expect(verifyAsset).toHaveBeenCalledWith(Asset.nativeId())

      expect(response.content).toEqual({
        account: account.name,
        assetId: Asset.nativeId().toString('hex'),
        assetVerification: { status: 'verified' },
        confirmed: '2000000000',
        unconfirmed: '2000000000',
        pending: '2000000000',
        available: '2000000000',
        availableNoteCount: 1,
        unconfirmedCount: 0,
        pendingCount: 0,
        blockHash: null,
        confirmations: 0,
        sequence: null,
      })
    })
  })
})
