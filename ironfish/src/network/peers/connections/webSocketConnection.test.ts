/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import ws from 'ws'
import { createRootLogger } from '../../../logger'
import { IdentifyMessage } from '../../messages/identify'
import { defaultFeatures } from '../peerFeatures'
import { ConnectionDirection } from './connection'
import { WebSocketConnection } from './webSocketConnection'

jest.mock('ws')

describe('WebSocketConnection', () => {
  afterAll(() => {
    jest.unmock('ws')
  })

  describe('send', () => {
    describe('with a valid message', () => {
      it('serializes and sends the message on the datachannel', () => {
        const connection = new WebSocketConnection(
          new ws(''),
          ConnectionDirection.Outbound,
          createRootLogger(),
        )
        const socket = connection['socket']
        const send = jest.spyOn(socket, 'send').mockImplementationOnce(jest.fn())
        const message = new IdentifyMessage({
          agent: '',
          head: Buffer.alloc(32, 0),
          identity: Buffer.alloc(32, 'identity').toString('base64'),
          port: 9033,
          sequence: 1,
          version: 0,
          work: BigInt(0),
          networkId: 0,
          genesisBlockHash: Buffer.alloc(32, 0),
          features: defaultFeatures(),
        })

        expect(connection.send(message)).toBe(true)
        expect(send).toHaveBeenCalledWith(message.serialize())
        connection.close()
      })
    })
  })
})
