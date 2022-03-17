/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tweetnacl from 'tweetnacl'
import { unboxMessage } from '../../network/peers/encryption'
import { BoxMessageRequest, BoxMessageResponse, BoxMessageTask } from './boxMessage'

describe('BoxMessageRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const publicKey = Uint8Array.from(Buffer.from('foo'))
    const secretKey = Uint8Array.from(Buffer.from('bar'))

    const request = new BoxMessageRequest('foo', { publicKey, secretKey }, 'aaaa')
    const buffer = request.serialize()
    const deserializedRequest = BoxMessageRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('BoxMessageResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new BoxMessageResponse('foo', 'bar', 0)
    const buffer = response.serialize()
    const deserializedResponse = BoxMessageResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('BoxMessageTask', () => {
  describe('execute', () => {
    it('boxes the message successfully', () => {
      const task = new BoxMessageTask()
      const message = 'foo'

      const recipient = tweetnacl.box.keyPair()
      const sender = tweetnacl.box.keyPair()

      const request = new BoxMessageRequest(
        message,
        sender,
        Buffer.from(recipient.publicKey).toString('base64'),
      )

      const response = task.execute(request)

      const unboxedMessage = unboxMessage(
        response.boxedMessage,
        response.nonce,
        Buffer.from(sender.publicKey).toString('base64'),
        recipient,
      )

      expect(unboxedMessage).toEqual(message)
    })
  })
})
