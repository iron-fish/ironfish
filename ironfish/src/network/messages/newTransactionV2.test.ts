/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useTxSpendsFixture } from '../../testUtilities'
import { NewTransactionV2Message } from './newTransactionV2'

describe('NewTransactionV2Message', () => {
  const nodeTest = createNodeTest()

  function expectNewTransactionV2MessageToMatch(
    a: NewTransactionV2Message,
    b: NewTransactionV2Message,
  ): void {
    // Test transactions separately because Transaction is not a primitive type
    expect(a.transactions.length).toEqual(b.transactions.length)
    a.transactions.forEach((transactionA, transactionIndexA) => {
      const transactionB = b.transactions[transactionIndexA]

      expect(transactionA.hash().equals(transactionB.hash())).toBe(true)
    })

    expect({ ...a, transactions: undefined }).toMatchObject({ ...b, transactions: undefined })
  }

  // eslint-disable-next-line jest/expect-expect
  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { transaction } = await useTxSpendsFixture(nodeTest.node)

    const transactions = [...new Array(10)].map((_) => transaction)

    const message = new NewTransactionV2Message(transactions)

    const buffer = message.serialize()
    const deserializedMessage = NewTransactionV2Message.deserialize(buffer)

    expectNewTransactionV2MessageToMatch(message, deserializedMessage)
  })
})
