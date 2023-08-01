/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  createNodeTest,
  serializePayloadToBuffer,
  useMinersTxFixture,
  useTxSpendsFixture,
} from '../../testUtilities'
import { NewTransactionsMessage } from './newTransactions'

describe('NewTransactionsMessage', () => {
  const nodeTest = createNodeTest()

  function expectNewTransactionsMessageToMatch(
    a: NewTransactionsMessage,
    b: NewTransactionsMessage,
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
    const transactionB = await useMinersTxFixture(nodeTest.node, account)

    const transactions = [transactionA, transactionB]

    const message = new NewTransactionsMessage(transactions)

    const buffer = serializePayloadToBuffer(message)
    const deserializedMessage = NewTransactionsMessage.deserializePayload(buffer)

    expectNewTransactionsMessageToMatch(message, deserializedMessage)
  })
})
