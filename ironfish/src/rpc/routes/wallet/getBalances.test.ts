/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('getBalances', () => {
  const routeTest = createRouteTest(true)

  beforeAll(async () => {
    await routeTest.node.wallet.createAccount('account', true)
  })

  describe('with a missing account', () => {
    it('throws a validation error', async () => {
      await expect(
        routeTest.client.getAccountBalances({ account: 'fake-account' }),
      ).rejects.toThrow('No account with name fake-account')
    })
  })

  describe('with a valid account', () => {
    it('streams balances for all assets owned by the account', async () => {
      const node = routeTest.node
      const wallet = node.wallet
      const account = await useAccountFixture(wallet)
      const asset = new Asset(account.spendingKey, 'mint-asset', 'metadata')
      const assetId = asset.id()

      const mockBalances = [
        {
          assetId: Asset.nativeId(),
          confirmed: BigInt(2000000000),
          unconfirmed: BigInt(2000000000),
          pending: BigInt(2000000000),
          available: BigInt(2000000000),
          unconfirmedCount: 0,
          pendingCount: 0,
          blockHash: null,
          sequence: null,
        },
        {
          assetId,
          confirmed: BigInt(8),
          unconfirmed: BigInt(8),
          pending: BigInt(8),
          available: BigInt(8),
          unconfirmedCount: 0,
          pendingCount: 0,
          blockHash: null,
          sequence: null,
        },
      ]

      const getBalances = jest
        .spyOn(wallet, 'getBalances')
        // eslint-disable-next-line @typescript-eslint/require-await
        .mockImplementationOnce(async function* () {
          for (const balance of mockBalances) {
            yield balance
          }
        })

      const response = await routeTest.client.getAccountBalances({
        account: account.name,
      })

      expect(getBalances).toHaveBeenCalledTimes(1)
      expect(response.content.balances).toEqual(
        mockBalances.map((mockBalance) => ({
          ...mockBalance,
          assetId: mockBalance.assetId.toString('hex'),
          confirmed: mockBalance.confirmed.toString(),
          unconfirmed: mockBalance.unconfirmed.toString(),
          pending: mockBalance.pending.toString(),
          available: mockBalance.available.toString(),
        })),
      )
    })
  })
})
