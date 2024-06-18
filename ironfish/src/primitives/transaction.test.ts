/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { DataType } from './dataDescription'
import { RawTransaction } from './rawTransaction'
import { Transaction, TransactionVersion } from './transaction'

describe('Transaction', () => {
  it('serializes and deserializes transaction as expected', () => {
    const dataStr = 'deadbeef'
    const raw = new RawTransaction(TransactionVersion.V3)

    raw.data.push({ dataType: DataType.Undefined, data: Buffer.from(dataStr, 'hex') })
    const key = generateKey()
    const tx = raw.post(key.spendingKey)
    expect(tx.data[0].data.toString('hex')).toBe(dataStr)

    const txStr = tx.serialize().toString('hex')

    const deserialized = new Transaction(Buffer.from(txStr, 'hex'))
    expect(deserialized.data[0].data.toString('hex')).toBe(dataStr)
  })
})
