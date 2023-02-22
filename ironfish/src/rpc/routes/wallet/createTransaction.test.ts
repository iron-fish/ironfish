/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset } from '@ironfish/rust-nodejs'
import { RawTransactionSerde } from '../../../primitives/rawTransaction'
import {
  SpendingAccount,
  useAccountFixture,
  useMinerBlockFixture,
} from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { ERROR_CODES } from '../../adapters/errors'

const REQUEST_PARAMS = {
  account: 'existingAccount',
  outputs: [
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
  account: 'existingAccount',
  outputs: [
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
  let sender: SpendingAccount
  beforeAll(async () => {
    sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
  })

  it('throws if not enough funds', async () => {
    await expect(routeTest.client.createTransaction(REQUEST_PARAMS)).rejects.toThrow(
      expect.objectContaining({
        message: expect.any(String),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })

  it('should generate a valid transaction', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      block.transactions[0].notes[0].decryptNoteForOwner(sender.incomingViewKey)

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
    }
    const response = await routeTest.client.createTransaction(REQUEST_PARAMS)

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.outputs.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBe(1n)
  })

  it('should generate a valid transaction with multiple outputs', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
    }

    const response = await routeTest.client.createTransaction(
      REQUEST_PARAMS_WITH_MULTIPLE_RECIPIENTS,
    )

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.outputs.length).toBe(2)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBe(1n)
  })

  it('should generate a valid transaction with fee rate', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
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
      fee: undefined,
      feeRate: '200',
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.outputs.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })

  it('should create transaction if fee and fee rate are empty', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
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
      fee: undefined,
    })

    expect(response.status).toBe(200)
    expect(response.content.transaction).toBeDefined()

    const rawTransactionBytes = Buffer.from(response.content.transaction, 'hex')
    const rawTransaction = RawTransactionSerde.deserialize(rawTransactionBytes)

    expect(rawTransaction.outputs.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(0)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })

  it('should create transaction to mint new asset', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
    }

    const asset = new Asset(sender.spendingKey, 'mint-asset', 'metadata')

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

    expect(rawTransaction.outputs.length).toBe(1)
    expect(rawTransaction.expiration).toBeDefined()
    expect(rawTransaction.burns.length).toBe(0)
    expect(rawTransaction.mints.length).toBe(1)
    expect(rawTransaction.spends.length).toBe(1)
    expect(rawTransaction.fee).toBeGreaterThan(0n)
  })

  it('throw error when create transaction to mint unknown asset', async () => {
    const asset = new Asset(sender.spendingKey, 'unknown-asset', 'metadata')

    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
    }

    await expect(
      routeTest.client.createTransaction({
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
      }),
    ).rejects.toThrow(`${asset.id().toString('hex')} not found`)
  })

  it('throw error when create transaction without mint asset', async () => {
    for (let i = 0; i < 3; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await expect(routeTest.node.chain).toAddBlock(block)

      await routeTest.node.wallet.updateHead()
    }

    await expect(
      routeTest.client.createTransaction({
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
            value: BigInt(10).toString(),
          },
        ],
        fee: BigInt(1).toString(),
      }),
    ).rejects.toThrow(`Must provide name or identifier to mint`)
  })

  it('should throw an error when attempting to create a transaction with no valid confirmations', async () => {
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
        message: expect.any(String),
        status: 400,
        code: ERROR_CODES.INSUFFICIENT_BALANCE,
      }),
    )
  })
})
