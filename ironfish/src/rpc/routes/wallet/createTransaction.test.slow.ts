/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import {
  SpendingAccount,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/createTransaction', () => {
  const routeTest = createRouteTest(true)
  let sender: SpendingAccount

  beforeAll(async () => {
    sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
  })

  it('should create transaction to mint existing asset', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const asset = new Asset(sender.spendingKey, 'new-asset', 'metadata')
    const mintData = {
      name: asset.name().toString('utf8'),
      metadata: asset.metadata().toString('utf8'),
      value: 10n,
      isNewAsset: true,
    }

    const mintTransaction = await useTxFixture(
      routeTest.node.wallet,
      sender,
      sender,
      async () => {
        const raw = await routeTest.node.wallet.createTransaction({
          account: sender,
          mints: [mintData],
          fee: 0n,
          expiration: 0,
        })

        return routeTest.node.wallet.post({
          transaction: raw,
          account: sender,
        })
      },
    )

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
        [mintTransaction],
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    const response = await routeTest.client.createTransaction({
      account: 'existingAccount',
      outputs: [
        {
          publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
          amount: BigInt(10).toString(),
          memo: '',
          assetId: Asset.nativeId().toString('hex'),
        },
      ],
      mints: [
        {
          assetId: asset.id().toString('hex'),
          value: BigInt(10).toString(),
        },
      ],
      fee: BigInt(1).toString(),
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.outputs.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(1)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })
})
