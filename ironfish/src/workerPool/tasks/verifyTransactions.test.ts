/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { MintData } from '../../primitives/rawTransaction'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useAccountFixture,
  useMinersTxFixture,
  usePostTxFixture,
} from '../../testUtilities'
import {
  VerifyTransactionsRequest,
  VerifyTransactionsResponse,
  VerifyTransactionsTask,
} from './verifyTransactions'

describe('VerifyTransactionsRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const mockTransactionPosted = Buffer.from('')
    const request = new VerifyTransactionsRequest([mockTransactionPosted], [])
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
    it('verifies transactions', async () => {
      const { node, wallet } = nodeTest

      const account = await useAccountFixture(wallet)
      const asset = new Asset(account.publicAddress, 'testcoin', '')
      const transaction1 = await useMinersTxFixture(node, account)

      const mint: MintData = {
        name: asset.name().toString('hex'),
        metadata: asset.metadata().toString('hex'),
        value: 5n,
      }

      const transaction2 = await usePostTxFixture({
        node,
        wallet,
        from: account,
        mints: [mint],
      })

      const task = new VerifyTransactionsTask()
      const request = new VerifyTransactionsRequest(
        [transaction1.serialize(), transaction2.serialize()],
        [asset.creator()],
      )

      const response = task.execute(request)
      expect(response).toEqual(new VerifyTransactionsResponse(true, request.jobId))
    })

    it('fails verification if using the wrong mint owners', async () => {
      const { node, wallet } = nodeTest

      const account = await useAccountFixture(wallet)
      const other_account = await useAccountFixture(wallet, 'other account')
      const asset = new Asset(account.publicAddress, 'testcoin', '')
      const transaction1 = await useMinersTxFixture(node, account)

      const mint: MintData = {
        name: asset.name().toString('hex'),
        metadata: asset.metadata().toString('hex'),
        value: 5n,
      }

      const transaction2 = await usePostTxFixture({
        node,
        wallet,
        from: account,
        mints: [mint],
      })

      const task = new VerifyTransactionsTask()
      const request = new VerifyTransactionsRequest(
        [transaction1.serialize(), transaction2.serialize()],
        [Buffer.from(other_account.publicAddress, 'hex')],
      )

      const response = task.execute(request)
      expect(response).toEqual(new VerifyTransactionsResponse(false, request.jobId))
    })
  })
})
