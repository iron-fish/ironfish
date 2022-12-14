/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useMinersTxFixture, useTxSpendsFixture } from '../../testUtilities'
import { NewTransactionMessage } from './newTransaction'

describe('NewTransactionMessage', () => {
  const nodeTest = createNodeTest()

  function expectNewTransactionMessageToMatch(
    a: NewTransactionMessage,
    b: NewTransactionMessage,
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
    const { account, transaction: transactionA } = await useTxSpendsFixture(nodeTest.node)
    const transactionB = await useMinersTxFixture(nodeTest.node.wallet, account)

    const transactions = [transactionA, transactionB]

    const message = new NewTransactionMessage(transactions)

    const buffer = message.serialize()
    const deserializedMessage = NewTransactionMessage.deserialize(buffer)

    expectNewTransactionMessageToMatch(message, deserializedMessage)
  })
})
