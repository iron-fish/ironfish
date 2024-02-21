/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Transaction, TransactionVersion } from '../../primitives/transaction'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useAccountFixture,
} from '../../testUtilities'
import {
  CreateMinersFeeRequest,
  CreateMinersFeeResponse,
  CreateMinersFeeTask,
} from './createMinersFee'

describe('CreateMinersFeeRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new CreateMinersFeeRequest(
      BigInt(0),
      Buffer.from('memo'),
      'spendKey',
      TransactionVersion.V1,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = CreateMinersFeeRequest.deserializePayload(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('CreateMinersFeeResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new CreateMinersFeeResponse(Uint8Array.from([0, 1, 2]), 0)
    const buffer = serializePayloadToBuffer(response)
    const deserializedResponse = CreateMinersFeeResponse.deserializePayload(
      response.jobId,
      buffer,
    )
    expect(deserializedResponse).toEqual(response)
  })
})

describe('CreateMinersFeeTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('posts a v1 miners fee transaction', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const request = new CreateMinersFeeRequest(
        BigInt(0),
        Buffer.from('memo'),
        account.spendingKey,
        TransactionVersion.V1,
      )
      const response = new CreateMinersFeeTask().execute(request)

      const transaction = new Transaction(Buffer.from(response.serializedTransactionPosted))
      expect(transaction.notes.length).toEqual(1)
      expect(transaction.version()).toEqual(TransactionVersion.V1)
    })

    it('posts a v2 miners fee transaction', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const request = new CreateMinersFeeRequest(
        BigInt(0),
        Buffer.from('memo'),
        account.spendingKey,
        TransactionVersion.V2,
      )
      const response = new CreateMinersFeeTask().execute(request)

      const transaction = new Transaction(Buffer.from(response.serializedTransactionPosted))
      expect(transaction.notes.length).toEqual(1)
      expect(transaction.version()).toEqual(TransactionVersion.V2)
    })
  })
})
