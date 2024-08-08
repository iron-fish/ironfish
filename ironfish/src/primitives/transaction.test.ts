/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { RawTransaction } from './rawTransaction'
import { Transaction, TransactionVersion } from './transaction'

describe('Transaction', () => {
  it('serializes and deserializes transaction as expected', () => {
    const dataStr = 'deadbeef'
    const data = Buffer.from(dataStr, 'hex')
    const raw = new RawTransaction(TransactionVersion.V3)
    const to = Buffer.from('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'hex')
    raw.evm = {
      nonce: 0n,
      gasPrice: 1n,
      gasLimit: 1000000000n,
      to,
      value: 100_000_000_000_000_000n,
      data,
      privateIron: 0n,
      publicIron: 0n,
    }
    const key = generateKey()
    const tx = raw.post(key.spendingKey)
    expect(tx.evm?.data.toString('hex')).toBe(dataStr)

    const txStr = tx.serialize().toString('hex')

    const deserialized = new Transaction(Buffer.from(txStr, 'hex'))
    expect(deserialized.evm?.data.toString('hex')).toBe(dataStr)
    expect(deserialized.evm?.to.toString('hex')).toBe(to.toString('hex'))
    expect(deserialized.evm?.value).toBe(100_000_000_000_000_000n)
    expect(deserialized.evm?.nonce).toBe(0n)
    expect(deserialized.evm?.gasPrice).toBe(1n)
    expect(deserialized.evm?.gasLimit).toBe(1000000000n)
    expect(deserialized.evm?.v).toBeDefined()
    expect(deserialized.evm?.r).toBeDefined()
    expect(deserialized.evm?.s).toBeDefined()
  })
})
