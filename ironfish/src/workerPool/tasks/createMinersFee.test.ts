/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { TransactionPosted } from 'ironfish-rust-nodejs'
import {
  CreateMinersFeeReq,
  CreateMinersFeeRequest,
  CreateMinersFeeResp,
  handleCreateMinersFee,
} from './createMinersFee'

describe('CreateMinersFee', () => {
  const spendKey = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const amount = BigInt(20)
  const memo = ''

  const req: CreateMinersFeeRequest = {
    type: 'createMinersFee',
    spendKey,
    amount,
    memo,
  }

  it('properly serializes request', () => {
    const serializedRequest = CreateMinersFeeReq.serialize(req)
    const createMinersFee = new CreateMinersFeeReq(serializedRequest)

    expect(createMinersFee.spendKey()).toEqual(spendKey)
    expect(createMinersFee.amount()).toEqual(amount)
    expect(createMinersFee.memo()).toEqual(memo)
  })

  // TODO: Need to properly mock transaction
  it('properly deserializes response', () => {
    const { responseType, response } = handleCreateMinersFee(CreateMinersFeeReq.serialize(req))
    expect(responseType).toEqual('createMinersFee')
    expect(response).toBeInstanceOf(Uint8Array)
    const resp = new CreateMinersFeeResp(response)

    const transaction = new TransactionPosted(Buffer.from(resp.serializedTransactionPosted()))
    expect(transaction.fee()).toEqual(BigInt(-20))
  })
})
