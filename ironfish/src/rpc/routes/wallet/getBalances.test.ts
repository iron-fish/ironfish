/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/getBalances', () => {
  const routeTest = createRouteTest(true)

  describe('with a missing account', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.wallet.getAccountBalances({ account: 'fake-account' }),
      ).rejects.toThrow('No account with name fake-account')
    })
  })

  describe('with a valid account', () => {
    it('streams balances for all assets owned by the account', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet, 'accountA')
      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const assetId = asset.id()

      const mockBalances = [
        {
          assetId,
          assetName: asset.name(),
          assetCreator: asset.creator(),
          assetOwner: asset.creator(),
          confirmed: BigInt(8),
          unconfirmed: BigInt(8),
          pending: BigInt(8),
          available: BigInt(8),
          availableNoteCount: 1,
          unconfirmedCount: 0,
          pendingCount: 0,
          blockHash: null,
          sequence: null,
        },
        {
          assetId: Asset.nativeId(),
          assetName: Buffer.from('$IRON', 'utf8'),
          assetCreator: Buffer.from('Iron Fish', 'utf8'),
          assetOwner: Buffer.from('Iron Fish', 'utf8'),
          confirmed: BigInt(2000000000),
          unconfirmed: BigInt(2000000000),
          pending: BigInt(2000000000),
          available: BigInt(2000000000),
          availableNoteCount: 1,
          unconfirmedCount: 0,
          pendingCount: 0,
          blockHash: null,
          sequence: null,
        },
      ]

      const getBalances = jest
        .spyOn(account, 'getBalances')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementationOnce(async function* () {
          for (const balance of mockBalances) {
            yield balance
          }
        })

      jest.spyOn(account, 'getAsset').mockReturnValueOnce(
        Promise.resolve({
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          creator: asset.creator(),
          owner: asset.creator(),
          createdTransactionHash: Buffer.alloc(32),
          blockHash: Buffer.alloc(32),
          sequence: null,
          supply: null,
        }),
      )

      const response = await routeTest.client.wallet.getAccountBalances({
        account: account.name,
      })

      expect(getBalances).toHaveBeenCalledTimes(1)

      expect(response.content.balances).toMatchObject(
        mockBalances.map((mockBalance) => ({
          ...mockBalance,
          assetId: mockBalance.assetId.toString('hex'),
          assetName: mockBalance.assetName.toString('hex'),
          assetCreator: mockBalance.assetCreator.toString('hex'),
          assetOwner: mockBalance.assetOwner.toString('hex'),
          confirmed: mockBalance.confirmed.toString(),
          unconfirmed: mockBalance.unconfirmed.toString(),
          pending: mockBalance.pending.toString(),
          available: mockBalance.available.toString(),
        })),
      )
    })

    it('returns asset verification information', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet, 'accountB')
      const asset = new Asset(account.publicAddress, 'mint-asset', 'metadata')
      const assetId = asset.id()

      const mockBalances = [
        {
          assetId,
          assetName: asset.name(),
          assetCreator: asset.creator(),
          assetOwner: asset.creator(),
          confirmed: BigInt(8),
          unconfirmed: BigInt(8),
          pending: BigInt(8),
          available: BigInt(8),
          availableNoteCount: 1,
          unconfirmedCount: 0,
          pendingCount: 0,
          blockHash: null,
          sequence: null,
        },
        {
          assetId: Asset.nativeId(),
          assetName: Buffer.from('$IRON', 'utf8'),
          assetCreator: Buffer.from('Iron Fish', 'utf8'),
          assetOwner: Buffer.from('Copper Clam', 'utf8'),
          confirmed: BigInt(2000000000),
          unconfirmed: BigInt(2000000000),
          pending: BigInt(2000000000),
          available: BigInt(2000000000),
          availableNoteCount: 1,
          unconfirmedCount: 0,
          pendingCount: 0,
          blockHash: null,
          sequence: null,
        },
      ]

      const getBalances = jest
        .spyOn(account, 'getBalances')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementationOnce(async function* (_confirmations) {
          for (const balance of mockBalances) {
            yield balance
          }
        })

      jest.spyOn(account, 'getAsset').mockReturnValueOnce(
        Promise.resolve({
          id: asset.id(),
          metadata: asset.metadata(),
          name: asset.name(),
          nonce: asset.nonce(),
          creator: asset.creator(),
          owner: asset.creator(),
          createdTransactionHash: Buffer.alloc(32),
          blockHash: Buffer.alloc(32),
          sequence: null,
          supply: null,
        }),
      )

      const verifyAsset = jest
        .spyOn(node.assetsVerifier, 'verify')
        .mockReturnValueOnce({ status: 'unverified' })
        .mockReturnValueOnce({ status: 'verified', symbol: 'FOO' })

      const response = await routeTest.client.wallet.getAccountBalances({
        account: account.name,
      })

      expect(getBalances).toHaveBeenCalledTimes(1)
      expect(verifyAsset).toHaveBeenCalledWith(asset.id())
      expect(verifyAsset).toHaveBeenCalledWith(Asset.nativeId())

      expect(response.content.balances).toMatchObject([
        {
          assetId: assetId.toString('hex'),
          assetVerification: { status: 'unverified' },
        },
        {
          assetId: Asset.nativeId().toString('hex'),
          assetVerification: { status: 'verified' },
        },
      ])
    })
  })
})
