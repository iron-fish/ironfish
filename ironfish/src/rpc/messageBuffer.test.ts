/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MessageBuffer } from './messageBuffer'

describe('MessageBuffer', () => {
  const delimiter = '\n'
  const firstMessage = 'foo'
  const secondMessage = 'bar'
  let messageBuffer: MessageBuffer

  beforeEach(() => {
    messageBuffer = new MessageBuffer(delimiter)
  })

  it('should read message strings from buffer', () => {
    const buffer = Buffer.from(firstMessage + delimiter, 'utf-8')
    messageBuffer.write(buffer)
    const messages = messageBuffer.readMessages()
    expect(messages).toEqual([firstMessage])
  })

  it('should split messages by delimiter, in order', () => {
    const expectedMessages = [firstMessage, secondMessage]
    const buffer = Buffer.from(expectedMessages.join(delimiter) + delimiter, 'utf-8')
    messageBuffer.write(buffer)
    const messages = messageBuffer.readMessages()
    expect(messages).toEqual(expectedMessages)
  })

  it('should hold messages in buffer until delimiter is read', () => {
    const buffer = Buffer.from(firstMessage, 'utf-8')
    messageBuffer.write(buffer)
    let messages = messageBuffer.readMessages()
    expect(messages).toEqual([])

    messageBuffer.write(Buffer.from(delimiter, 'utf-8'))
    messages = messageBuffer.readMessages()
    expect(messages).toEqual([firstMessage])
  })

  it('should consume buffered messages on read', () => {
    const buffer = Buffer.from(firstMessage + delimiter, 'utf-8')
    messageBuffer.write(buffer)
    let messages = messageBuffer.readMessages()
    expect(messages).toEqual([firstMessage])

    messages = messageBuffer.readMessages()
    expect(messages).toEqual([])
  })

  it('should clear messages on clear', () => {
    const buffer = Buffer.from(firstMessage + delimiter, 'utf-8')
    messageBuffer.write(buffer)
    messageBuffer.clear()
    const messages = messageBuffer.readMessages()
    expect(messages).toEqual([])
  })
})
