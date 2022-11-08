/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createNodeTest, useTxSpendsFixture } from '../../testUtilities'
import { NewTransactionMessage } from './newTransaction'

describe('NewTransaction', () => {
  const nodeTest = createNodeTest()

  it('serializes the object into a buffer and deserializes to the original object', async () => {
    const { transaction } = await useTxSpendsFixture(nodeTest.node)

    const nonce = Buffer.alloc(16, 1)
    const message = new NewTransactionMessage(transaction, nonce)
    const deserializedMessage = NewTransactionMessage.deserialize(message.serialize(), nonce)

    // Test transaction separately because it's not a primitive type
    expect(message.transaction.hash().equals(deserializedMessage.transaction.hash())).toBe(true)
    expect({ ...message, transaction: undefined }).toMatchObject({
      ...deserializedMessage,
      transaction: undefined,
    })
  })
})
