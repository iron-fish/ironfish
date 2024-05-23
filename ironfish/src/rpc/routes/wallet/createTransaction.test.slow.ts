/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { useAccountFixture, useMinerBlockFixture, useTxFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route wallet/createTransaction', () => {
  const routeTest = createRouteTest()

  it('should create transaction to mint existing asset', async () => {
    const sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')

    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const asset = new Asset(sender.publicAddress, 'new-asset', 'metadata')
    const mintData = {
      creator: asset.creator().toString('hex'),
      name: asset.name().toString('utf8'),
      metadata: asset.metadata().toString('utf8'),
      value: 10n,
      isNewAsset: true,
    }

    for (let i = 0; i < 3; ++i) {
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

          const { transaction } = await routeTest.node.wallet.post({
            transaction: raw,
            account: sender,
          })
          return transaction
        },
      )

      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
        [mintTransaction],
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.scan()])
    }

    const response = await routeTest.client.wallet.createTransaction({
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
