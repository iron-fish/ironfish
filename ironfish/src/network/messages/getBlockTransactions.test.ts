/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createNodeTest,
  serializePayloadToBuffer,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../../testUtilities'
import { expectGetBlockTransactionsResponseToMatch } from '../testUtilities'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './getBlockTransactions'

describe('GetBlockTransactionsRequest', () => {
  it('serializes the object into a buffer and deserializes to the original object', () => {
    const rpcId = 0
    const blockHash = Buffer.alloc(32, 1)
    const transactionIndexes = [1, 60000]

    const message = new GetBlockTransactionsRequest(blockHash, transactionIndexes, rpcId)
    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetBlockTransactionsRequest.deserializePayload(buffer, rpcId)

    expect(deserializedMessage).toEqual(message)
  })
})

describe('GetBlockTransactionsResponse', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node, account)

    const rpcId = 0
    const blockHash = Buffer.alloc(32, 1)
    const transactions = [transactionA, transactionB]

    const message = new GetBlockTransactionsResponse(blockHash, transactions, rpcId)
    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = GetBlockTransactionsResponse.deserializePayload(buffer, rpcId)

    expectGetBlockTransactionsResponseToMatch(message, deserializedMessage)
  })
})
