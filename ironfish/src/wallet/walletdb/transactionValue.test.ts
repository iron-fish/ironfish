/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { BufferMap } from 'buffer-map'
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import { TransactionValue, TransactionValueEncoding } from './transactionValue'

describe('TransactionValueEncoding', () => {
  const nodeTest = createNodeTest()

  function expectTransactionValueToMatch(a: TransactionValue, b: TransactionValue): void {
    // Test transaction separately because it's not a primitive type
    expect(a.transaction.equals(b.transaction)).toBe(true)
    expect({ ...a, transaction: undefined }).toMatchObject({ ...b, transaction: undefined })
  }

  describe('with a null block hash and sequence', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const assetBalanceDeltas = new BufferMap<bigint>()
      assetBalanceDeltas.set(Asset.nativeId(), -transaction.fee())

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: null,
        sequence: null,
        submittedSequence: 123,
        assetBalanceDeltas,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })

  describe('with a null block hash', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const assetBalanceDeltas = new BufferMap<bigint>()
      assetBalanceDeltas.set(Asset.nativeId(), -transaction.fee())

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: null,
        sequence: null,
        submittedSequence: 123,
        assetBalanceDeltas,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })

  describe('with a null sequence', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const assetBalanceDeltas = new BufferMap<bigint>()
      assetBalanceDeltas.set(Asset.nativeId(), -transaction.fee())

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: Buffer.alloc(32, 1),
        sequence: 124,
        submittedSequence: 123,
        assetBalanceDeltas,
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })

  describe('with empty asset balance deltas', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: Buffer.alloc(32, 1),
        sequence: 124,
        submittedSequence: 123,
        assetBalanceDeltas: new BufferMap<bigint>(),
      }
      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })

  describe('with multiple assets', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const { wallet } = nodeTest

      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const assetBalanceDeltas = new BufferMap<bigint>()

      const accountA = await useAccountFixture(wallet, 'accountA')
      const testAsset = new Asset(accountA.publicAddress, 'test-asset', 'test-asset-metadata')

      assetBalanceDeltas.set(Asset.nativeId(), -transaction.fee())
      assetBalanceDeltas.set(testAsset.id(), 1n)

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: Buffer.alloc(32, 1),
        sequence: 124,
        submittedSequence: 123,
        assetBalanceDeltas,
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })

  describe('with all fields defined', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const assetBalanceDeltas = new BufferMap<bigint>()
      assetBalanceDeltas.set(Asset.nativeId(), -transaction.fee())

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: Buffer.alloc(32, 1),
        sequence: 124,
        submittedSequence: 123,
        assetBalanceDeltas,
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })

  describe('with negative balance delta', () => {
    it('serializes the object into a buffer and deserializes to the original object', async () => {
      const encoder = new TransactionValueEncoding()

      const transaction = await useMinersTxFixture(nodeTest.node)

      const assetBalanceDeltas = new BufferMap<bigint>()
      assetBalanceDeltas.set(Asset.nativeId(), -20n)

      const value: TransactionValue = {
        transaction,
        timestamp: new Date(),
        blockHash: Buffer.alloc(32, 1),
        sequence: 124,
        submittedSequence: 123,
        assetBalanceDeltas,
      }

      const buffer = encoder.serialize(value)
      const deserializedValue = encoder.deserialize(buffer)
      expectTransactionValueToMatch(deserializedValue, value)
    })
  })
})
