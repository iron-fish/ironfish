/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger } from '../../../logger'
import { IdentifyMessage } from '../../messages/identify'
import { WebRtcConnection } from './webRtcConnection'

describe('Connection', () => {
  describe('parseMessage', () => {
    describe('with a malformed header', () => {
      it('throws an error', () => {
        const connection = new WebRtcConnection(false, createRootLogger())
        expect(() => connection.parseMessage(Buffer.from(''))).toThrowError()
        connection.close()
      })
    })

    describe('with a malformed body', () => {
      it('throws an error', () => {
        const connection = new WebRtcConnection(false, createRootLogger())
        const message = new IdentifyMessage({
          agent: '',
          head: Buffer.alloc(32, 0),
          identity: 'identity',
          port: 9033,
          sequence: 1,
          version: 0,
          work: BigInt(0),
        })
        jest.spyOn(message, 'serialize').mockImplementationOnce(() => Buffer.from('adsf'))

        expect(() => connection.parseMessage(message.serializeWithMetadata())).toThrowError()
        connection.close()
      })
    })

    describe('with a valid message', () => {
      it('parses the message', () => {
        const connection = new WebRtcConnection(false, createRootLogger())
        const message = new IdentifyMessage({
          agent: '',
          head: Buffer.alloc(32, 0),
          identity: Buffer.alloc(32, 'identity').toString('base64'),
          port: 9033,
          sequence: 1,
          version: 0,
          work: BigInt(0),
        })

        expect(connection.parseMessage(message.serializeWithMetadata())).toEqual(message)
        connection.close()
      })
    })
  })
})
