/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { blake3 } from '@napi-rs/blake-hash'
import { v4 as uuid } from 'uuid'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../../testUtilities'
import { PooledTransactionsRequest, PooledTransactionsResponse } from './pooledTransactions'

describe('PooledTransactionsRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 53242
    const hashes = [...Array(10)].map((_) => blake3(uuid()))

    const message = new PooledTransactionsRequest(hashes, rpcId)

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = PooledTransactionsRequest.deserializePayload(buffer, rpcId)
    expect(deserializedMessage).toEqual(message)
  })
})

describe('PooledTransactionsResponse', () => {
  const nodeTest = createNodeTest()

  function expectPooledTransactionsResponseToMatch(
    a: PooledTransactionsResponse,
    b: PooledTransactionsResponse,
  ): void {
    // Test transactions separately because Transaction is not a primitive type
    expect(a.transactions.length).toEqual(b.transactions.length)
    a.transactions.forEach((transactionA, transactionIndexA) => {
      const transactionB = b.transactions[transactionIndexA]

      expect(transactionA.hash().equals(transactionB.hash())).toBe(true)
    })

    expect({ ...a, transactions: undefined }).toMatchObject({ ...b, transactions: undefined })
  }

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node, account)

    const rpcId = 53242
    const transactions = [transactionA, transactionB]

    const message = new PooledTransactionsResponse(transactions, rpcId)

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = PooledTransactionsResponse.deserializePayload(buffer, rpcId)

    expectPooledTransactionsResponseToMatch(message, deserializedMessage)
  })
})
