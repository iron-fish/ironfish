/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tweetnacl from 'tweetnacl'
import { boxMessage } from '../../network/peers/encryption'
import { UnboxMessageRequest, UnboxMessageResponse, UnboxMessageTask } from './unboxMessage'

describe('UnboxMessageRequest', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const recipient = tweetnacl.box.keyPair()
    const sender = tweetnacl.box.keyPair()

    const { nonce, boxedMessage } = boxMessage(
      'test',
      sender,
      Buffer.from(recipient.publicKey).toString('base64'),
    )

    const request = new UnboxMessageRequest(
      boxedMessage,
      nonce,
      Buffer.from(sender.publicKey).toString('base64'),
      recipient,
    )
    const buffer = request.serialize()
    const deserializedRequest = UnboxMessageRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('UnboxMessageResponse', () => {
  it('serializes the object to a buffer and deserializes to the original object', () => {
    const response = new UnboxMessageResponse('test', 1)
    const buffer = response.serialize()
    const deserializedResponse = UnboxMessageResponse.deserialize(response.jobId, buffer)
    expect(deserializedResponse).toEqual(response)
  })
})

describe('UnboxMessageTask', () => {
  describe('execute', () => {
    it('unboxes a message successfully', () => {
      const recipient = tweetnacl.box.keyPair()
      const sender = tweetnacl.box.keyPair()

      const { nonce, boxedMessage } = boxMessage(
        'test',
        sender,
        Buffer.from(recipient.publicKey).toString('base64'),
      )

      const task = new UnboxMessageTask()
      const request = new UnboxMessageRequest(
        boxedMessage,
        nonce,
        Buffer.from(sender.publicKey).toString('base64'),
        recipient,
      )

      const result = task.execute(request)

      expect(result.message).toEqual('test')
      expect(result.jobId).toEqual(request.jobId)
    })

    it('returns null when message could not be unboxed', () => {
      const recipient = tweetnacl.box.keyPair()
      const sender = tweetnacl.box.keyPair()
      const other = tweetnacl.box.keyPair()

      const { nonce, boxedMessage } = boxMessage(
        'test',
        sender,
        Buffer.from(recipient.publicKey).toString('base64'),
      )

      const task = new UnboxMessageTask()
      const request = new UnboxMessageRequest(
        boxedMessage,
        nonce,
        Buffer.from(recipient.publicKey).toString('base64'),
        other,
      )

      const result = task.execute(request)

      expect(result.message).toBeNull()
      expect(result.jobId).toEqual(request.jobId)
    })
  })
})
