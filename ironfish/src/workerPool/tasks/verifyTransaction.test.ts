/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import {
  VerifyTransactionRequest,
  VerifyTransactionResponse,
  VerifyTransactionTask,
} from './verifyTransaction'

describe('VerifyTransactionRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const mockTransactionPosted = Buffer.from('')
    const verifyFees = true
    const request = new VerifyTransactionRequest(mockTransactionPosted, { verifyFees })
    const buffer = request.serialize()
    const deserializedRequest = VerifyTransactionRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('VerifyTransactionResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new VerifyTransactionResponse(true, 0)
    const buffer = response.serialize()
    const deserializedResponse = VerifyTransactionResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('VerifyTransactionTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    describe('with negative fees when verifyFees is true', () => {
      it('returns false', async () => {
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        const task = new VerifyTransactionTask()
        const request = new VerifyTransactionRequest(transaction.serialize(), {
          verifyFees: true,
        })

        const response = task.execute(request)
        expect(response).toEqual(new VerifyTransactionResponse(false, request.jobId))
      })
    })

    describe('with valid fees', () => {
      it('verifies the transaction', async () => {
        const account = await useAccountFixture(nodeTest.accounts)
        const transaction = await useMinersTxFixture(nodeTest.accounts, account)

        const task = new VerifyTransactionTask()
        const request = new VerifyTransactionRequest(transaction.serialize(), {
          verifyFees: false,
        })

        const response = task.execute(request)
        expect(response).toEqual(new VerifyTransactionResponse(true, request.jobId))
      })
    })
  })
})
