/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { ERROR_CODES } from '../../adapters/errors'

const REQUEST_PARAMS = {
  sender: 'existingAccount',
  receives: [
    {
      publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
      amount: BigInt(10).toString(),
      memo: '',
      assetId: Asset.nativeId().toString('hex'),
    },
  ],
  fee: BigInt(1).toString(),
}

const REQUEST_PARAMS_WITH_MULTIPLE_RECIPIENTS = {
  sender: 'existingAccount',
  receives: [
    {
      publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
      amount: BigInt(10).toString(),
      memo: '',
      assetId: Asset.nativeId().toString('hex'),
    },
    {
      publicAddress: 'a9bd9a2526d82c6d25b832e016b14161a8aad5ceb6c67ab4bccd3383be16932a',
      amount: BigInt(10).toString(),
      memo: '',
      assetId: Asset.nativeId().toString('hex'),
    },
  ],
  fee: BigInt(1).toString(),
}

describe('Route wallet/createTransaction', () => {
  const routeTest = createRouteTest(true)
  let sender: Account

  beforeAll(async () => {
    sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
  })

  it('throws if not connected to network', async () => {
    routeTest.node.peerNetwork['_isReady'] = false

    await expect(routeTest.client.createTransaction(REQUEST_PARAMS)).rejects.toThrow(
      'Your node must be connected to the Iron Fish network to send a transaction',
    )
  })

  it('throws if the chain is outdated', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = false

    await expect(routeTest.client.createTransaction(REQUEST_PARAMS)).rejects.toThrow(
      'Your node must be synced with the Iron Fish network to send a transaction. Please try again later',
    )
  })

  it('throws if not enough funds', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    await expect(routeTest.client.createTransaction(REQUEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Your balance is too low. Add funds to your account first`,
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('should generate a valid transaction', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      block.transactions[0].notes[0].decryptNoteForOwner(sender.incomingViewKey)

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }
    const response = await routeTest.client.createTransaction(REQUEST_PARAMS)

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.receives.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBe(1n)
  })

  it('should generate a valid transaction with multiple receives', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    const response = await routeTest.client.createTransaction(
      REQUEST_PARAMS_WITH_MULTIPLE_RECIPIENTS,
    )

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.receives.length).toBe(2)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBe(1n)
  })

  it('should generate a valid transaction with fee rate', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    const response = await routeTest.client.createTransaction({
      sender: 'existingAccount',
      receives: [
        {
          publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
          amount: BigInt(10).toString(),
          memo: '',
          assetId: Asset.nativeId().toString('hex'),
        },
      ],
      fee: undefined,
      feeRate: '200',
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.receives.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })

  it('should create transaction if fee and fee rate are empty', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    const response = await routeTest.client.createTransaction({
      sender: 'existingAccount',
      receives: [
        {
          publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
          amount: BigInt(10).toString(),
          memo: '',
          assetId: Asset.nativeId().toString('hex'),
        },
      ],
      fee: undefined,
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.receives.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })

  it('should create transaction to mint new asset', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    const asset = new Asset(sender.spendingKey, 'mint-asset', 'metadata')

    const response = await routeTest.client.createTransaction({
      sender: 'existingAccount',
      receives: [
        {
          publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
          amount: BigInt(10).toString(),
          memo: '',
          assetId: Asset.nativeId().toString('hex'),
        },
      ],
      mints: [
        {
          metadata: asset.metadata().toString('hex'),
          name: asset.name().toString('hex'),
          value: BigInt(10).toString(),
        },
      ],
      fee: BigInt(1).toString(),
      confirmations: 0,
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.receives.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(1)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })

  it('throw error when create transaction to mint unknown asset', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const asset = new Asset(sender.spendingKey, 'unknown-asset', 'metadata')

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    await expect(
      routeTest.client.createTransaction({
        sender: 'existingAccount',
        receives: [
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
      }),
    ).rejects.toThrow(
      `Asset not found. Cannot mint for identifier '${asset.id().toString('hex')}'`,
    )
  })

  it('throw error when create transaction without mint asset', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])

      await Promise.all([routeTest.node.wallet.updateHead()])
    }

    await expect(
      routeTest.client.createTransaction({
        sender: 'existingAccount',
        receives: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: BigInt(10).toString(),
            memo: '',
            assetId: Asset.nativeId().toString('hex'),
          },
        ],
        mints: [
          {
            value: BigInt(10).toString(),
          },
        ],
        fee: BigInt(1).toString(),
      }),
    ).rejects.toThrow(`Must provide name or identifier to mint`)
  })

  it('should throw an error when attempting to create a transaction with no valid confirmations', async () => {
    routeTest.node.peerNetwork['_isReady'] = true
    routeTest.chain.synced = true

    const block = await useMinerBlockFixture(
      routeTest.chain,
      undefined,
      sender,
      routeTest.node.wallet,
    )

    await expect(routeTest.node.chain).toAddBlock(block)
    await routeTest.node.wallet.updateHead()

    const asset = new Asset(sender.spendingKey, 'mint-asset', 'metadata')

    await expect(
      routeTest.client.createTransaction({
        sender: 'existingAccount',
        receives: [
          {
            publicAddress: '0d804ea639b2547d1cd612682bf99f7cad7aad6d59fd5457f61272defcd4bf5b',
            amount: BigInt(10).toString(),
            memo: '',
            assetId: Asset.nativeId().toString('hex'),
          },
        ],
        mints: [
          {
            metadata: asset.metadata().toString('hex'),
            name: asset.name().toString('hex'),
            value: BigInt(10).toString(),
          },
        ],
        fee: BigInt(1).toString(),
        confirmations: 1000,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          `Not enough unspent notes available to fund the transaction.`,
        ),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })
})
