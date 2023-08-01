/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createNodeTest,
  serializePayloadToBuffer,
  useAccountFixture,
  useMinersTxFixture,
} from '../../testUtilities'
import {
  VerifyTransactionsRequest,
  VerifyTransactionsResponse,
  VerifyTransactionsTask,
} from './verifyTransactions'

describe('VerifyTransactionsRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const mockTransactionPosted = Buffer.from('')
    const request = new VerifyTransactionsRequest([mockTransactionPosted])
    const buffer = serializePayloadToBuffer(request)
    const deserializedRequest = VerifyTransactionsRequest.deserializePayload(
      request.jobId,
      buffer,
    )
    expect(deserializedRequest).toEqual(request)
  })
})

describe('VerifyTransactionsResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new VerifyTransactionsResponse(true, 0)
    const buffer = serializePayloadToBuffer(response)
    const deserializedResponse = VerifyTransactionsResponse.deserializePayload(
      response.jobId,
      buffer,
    )
    expect(deserializedResponse).toEqual(response)
  })
})

describe('VerifyTransactionsTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('verifies the transaction', async () => {
      const account = await useAccountFixture(nodeTest.wallet)
      const transaction = await useMinersTxFixture(nodeTest.node, account)

      const task = new VerifyTransactionsTask()
      const request = new VerifyTransactionsRequest([transaction.serialize()])

      const response = task.execute(request)
      expect(response).toEqual(new VerifyTransactionsResponse(true, request.jobId))
    })
  })
})
