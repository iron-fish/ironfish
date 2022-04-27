/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useAccountFixture, useMinersTxFixture } from '../../testUtilities'
import {
  TransactionFeeRequest,
  TransactionFeeResponse,
  TransactionFeeTask,
} from './transactionFee'

describe('TransactionFeeRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new TransactionFeeRequest(Buffer.from('fakeTransaction'))
    const buffer = request.serialize()
    const deserializedRequest = TransactionFeeRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('TransactionFeeResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new TransactionFeeResponse(12n, 0)
    const buffer = response.serialize()
    const deserializedResponse = TransactionFeeResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('TransactionFeeTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('returns the transaction fee', async () => {
      const account = await useAccountFixture(nodeTest.accounts)
      const transaction = await useMinersTxFixture(nodeTest.accounts, account)
      const request = new TransactionFeeRequest(transaction.serialize())
      const task = new TransactionFeeTask()
      const response = task.execute(request)
      expect(response.fee).toEqual(transaction.fee())
    })
  })
})
