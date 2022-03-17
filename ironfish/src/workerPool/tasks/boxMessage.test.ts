import { BoxMessageRequest, BoxMessageResponse, BoxMessageTask } from './boxMessage'

describe('BoxMessageRequest', () => {
  it('serializers the object to a buffer and deserializes to the original object', () => {
    const publicKey = Uint8Array.from(Buffer.from('foo'))
    const secretKey = Uint8Array.from(Buffer.from('bar'))

    const request = new BoxMessageRequest('foo', { publicKey, secretKey }, 'aaaa')
    const buffer = request.serialize()
    const deserializedRequest = BoxMessageRequest.deserialize(request.jobId, buffer)
    expect(deserializedRequest).toEqual(request)
  })
})

describe('BoxMessageResponse', () => {
  it('serializers the object to a buffer and deserializes to the original object', () => {
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

      const request = new BoxMessageRequest(
        'foo',
        { publicKey, secretKey },
        'Y2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2M=',
      )
      const response = task.execute(request)
    })
  })
})
