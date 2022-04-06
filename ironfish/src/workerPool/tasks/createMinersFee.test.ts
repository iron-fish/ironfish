/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useAccountFixture } from '../../testUtilities'
import {
  CreateMinersFeeRequest,
  CreateMinersFeeResponse,
  CreateMinersFeeTask,
} from './createMinersFee'

const mockSerializedTransaction = Buffer.from('foobar')
const postMinersFee = jest.fn().mockImplementationOnce(() => mockSerializedTransaction)

jest.mock('@ironfish/rust-nodejs', () => {
  const module =
    jest.requireActual<typeof import('@ironfish/rust-nodejs')>('@ironfish/rust-nodejs')
  return {
    ...module,
    Transaction: jest.fn().mockImplementation(() => ({
      post_miners_fee: postMinersFee,
      receive: jest.fn(),
    })),
  }
})

describe('CreateMinersFeeRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const request = new CreateMinersFeeRequest(BigInt(0), 'memo', 'spendKey')
    const buffer = request.serialize()
    const deserializedRequest = CreateMinersFeeRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('CreateMinersFeeResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new CreateMinersFeeResponse(Uint8Array.from([0, 1, 2]), 0)
    const buffer = response.serialize()
    const deserializedResponse = CreateMinersFeeResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('CreateMinersFeeTask', () => {
  const nodeTest = createNodeTest()

  describe('execute', () => {
    it('posts the miners fee transaction', async () => {
      const account = await useAccountFixture(nodeTest.accounts)

      const task = new CreateMinersFeeTask()
      const memo = 'memo'
      const spendingKey = account.spendingKey
      const request = new CreateMinersFeeRequest(BigInt(0), memo, spendingKey)
      const response = task.execute(request)

      expect(postMinersFee).toHaveBeenCalled()
      expect(response).toEqual(
        new CreateMinersFeeResponse(mockSerializedTransaction, request.jobId),
      )
    })
  })
})
