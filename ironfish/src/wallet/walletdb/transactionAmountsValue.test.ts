/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  TransactionAmountsValue,
  TransactionAmountsValueEncoding,
} from './transactionAmountsValue'

describe('TransactionAmountsValueEncoding', () => {
  function expectTransactionAmountsValueToMatch(
    a: TransactionAmountsValue,
    b: TransactionAmountsValue,
  ): void {
    expect(a.input).toEqual(b.input)
    expect(a.output).toEqual(b.output)
  }

  it('serializes the object into a buffer and deserializes to the original object', () => {
    const encoder = new TransactionAmountsValueEncoding()

    const amountsValue = {
      input: 1n,
      output: 0n,
    }

    const buffer = encoder.serialize(amountsValue)
    const deserializedValue = encoder.deserialize(buffer)
    expectTransactionAmountsValueToMatch(deserializedValue, amountsValue)
  })
})
