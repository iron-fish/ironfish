/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { createRootLogger } from '../../../logger'
import { IdentifyMessage } from '../../messages/identify'
import { WebRtcConnection } from './webRtcConnection'

describe('WebRtcConnection', () => {
  describe('send', () => {
    describe('with no datachannel', () => {
      it('returns false', () => {
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
        expect(connection.send(message)).toBe(false)
        connection.close()
      })
    })

    describe('with a valid message', () => {
      it('serializes and sends the message on the datachannel', () => {
        const connection = new WebRtcConnection(true, createRootLogger())
        const datachannel = connection['datachannel']
        Assert.isNotNull(datachannel)
        jest.spyOn(datachannel, 'isOpen').mockImplementation(() => true)
        const sendMessageBinary = jest
          .spyOn(datachannel, 'sendMessageBinary')
          .mockImplementationOnce(jest.fn())
        const message = new IdentifyMessage({
          agent: '',
          head: Buffer.alloc(32, 0),
          identity: Buffer.alloc(32, 'identity').toString('base64'),
          port: 9033,
          sequence: 1,
          version: 0,
          work: BigInt(0),
        })

        expect(connection.send(message)).toBe(true)
        expect(sendMessageBinary).toHaveBeenCalledWith(message.serializeWithMetadata())
        connection.close()
      })
    })
  })
})
