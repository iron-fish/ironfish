/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKeyFromPrivateKey } from '@ironfish/rust-nodejs'
import { Transaction } from '../../primitives'
import {
  createNodeTest,
  serializePayloadToBuffer,
  useAccountFixture,
  useMinerBlockFixture,
  useUnsignedTxFixture,
} from '../../testUtilities'
import { createRawTransaction } from '../../testUtilities/helpers/transaction'
import {
  BuildTransactionRequest,
  BuildTransactionResponse,
  BuildTransactionTask,
} from './buildTransaction'

describe('BuildTransactionRequest', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()

    const raw = await createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      fee: 1n,
      expiration: 5,
    })

    const key = generateKeyFromPrivateKey(account.spendingKey)

    const request = new BuildTransactionRequest(
      raw,
      key.proofAuthorizingKey,
      account.viewKey,
      account.outgoingViewKey,
    )
    const buffer = serializePayloadToBuffer(request)
    const deserialized = BuildTransactionRequest.deserializePayload(request.jobId, buffer)

    expect(deserialized).toEqual(request)
  })
})

describe('BuildTransactionResponse', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()

    const transaction = await useUnsignedTxFixture(nodeTest.wallet, account, account)

    const unsigned = transaction.takeReference()

    const response = new BuildTransactionResponse(unsigned, 0)
    const serialized = serializePayloadToBuffer(response)

    const deserialized = BuildTransactionResponse.deserializePayload(response.jobId, serialized)
    expect(deserialized.transaction.serialize().equals(transaction.serialize())).toBe(true)

    transaction.returnReference()
  })
})

describe('BuildTransactionTask', () => {
  const nodeTest = createNodeTest()

  it('builds the transaction', async () => {
    const account = await useAccountFixture(nodeTest.wallet)

    const block = await useMinerBlockFixture(
      nodeTest.chain,
      undefined,
      account,
      nodeTest.wallet,
    )
    await expect(nodeTest.chain).toAddBlock(block)
    await nodeTest.wallet.scan()

    const raw = await createRawTransaction({
      wallet: nodeTest.wallet,
      from: account,
      fee: 5n,
      expiration: 9,
    })

    const key = generateKeyFromPrivateKey(account.spendingKey)

    const request = new BuildTransactionRequest(
      raw,
      key.proofAuthorizingKey,
      account.viewKey,
      account.outgoingViewKey,
    )
    const task = new BuildTransactionTask()
    const response = task.execute(request)

    const postedTransactionSerialized = response.transaction.sign(account.spendingKey)
    const transaction = new Transaction(postedTransactionSerialized)

    expect(transaction.fee()).toEqual(5n)
    expect(transaction.expiration()).toEqual(9)
  })
})
