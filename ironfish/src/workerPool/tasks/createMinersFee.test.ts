/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from 'ironfish-rust-nodejs'
import {
  BinaryCreateMinersFeeRequest,
  BinaryCreateMinersFeeResponse,
  CreateMinersFeeRequest,
  handleCreateMinersFee,
} from './createMinersFee'

describe('CreateMinersFee', () => {
  it('properly serializes request', () => {
    const spendKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const amount = BigInt(20)
    const memo = ''

    const req: CreateMinersFeeRequest = {
      type: 'createMinersFee',
      spendKey,
      amount,
      memo,
    }

    const serializedRequest = BinaryCreateMinersFeeRequest.serialize(req)
    const createMinersFee = new BinaryCreateMinersFeeRequest(serializedRequest)

    expect(createMinersFee.spendKey()).toEqual(spendKey)
    expect(createMinersFee.amount()).toEqual(amount)
    expect(createMinersFee.memo()).toEqual(memo)
  })

  // TODO: Need to properly mock transaction
  it('properly deserializes response', () => {
    const spendKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const amount = BigInt(20)
    const memo = ''

    const req: CreateMinersFeeRequest = {
      type: 'createMinersFee',
      spendKey,
      amount,
      memo,
    }

    const { responseType, response } = handleCreateMinersFee(
      BinaryCreateMinersFeeRequest.serialize(req),
    )
    expect(responseType).toEqual('createMinersFee')
    expect(response).toBeInstanceOf(Uint8Array)
    const resp = new BinaryCreateMinersFeeResponse(response)

    const transaction = new TransactionPosted(Buffer.from(resp.serializedTransactionPosted()))
    expect(transaction.fee()).toEqual(BigInt(-20))
  })
})
