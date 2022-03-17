/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import tweetnacl from 'tweetnacl'
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
    it('boxes the message', () => {
      const task = new BoxMessageTask()
      const publicKey = Uint8Array.from(Buffer.from('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
      const secretKey = Uint8Array.from(Buffer.from('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'))

      const mockNonceValue = Uint8Array.from(Buffer.from('foo'))
      const mockBoxedMessageValue = Uint8Array.from(Buffer.from('foo'))

      jest.spyOn(tweetnacl, 'randomBytes').mockImplementationOnce(() => mockNonceValue)
      jest.spyOn(tweetnacl, 'box').mockImplementationOnce(() => mockBoxedMessageValue)

      const request = new BoxMessageRequest(
        'foo',
        { publicKey, secretKey },
        'Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2M=',
      )
      const nonce = Buffer.from(mockNonceValue).toString('base64')
      const boxedMessage = Buffer.from(mockBoxedMessageValue).toString('base64')

      const response = task.execute(request)
      expect(response.nonce).toEqual(nonce)
      expect(response.boxedMessage).toEqual(boxedMessage)
    })
  })
})
