/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import ws from 'ws'
import { createRootLogger } from '../../../logger'
import { IdentifyMessage } from '../../messages/identify'
import { defaultFeatures } from '../peerFeatures'
import { ConnectionDirection } from './connection'
import { WebSocketConnection } from './webSocketConnection'

jest.mock('../../version', () => {
  const moduleMock = jest.requireActual<typeof import('../../version')>('../../version')
  return {
    ...moduleMock,
    MAX_MESSAGE_SIZE: 256,
  }
})

jest.mock('ws')

describe('Connection', () => {
  afterAll(() => {
    jest.unmock('ws')
  })

  describe('send', () => {
    it('should send a message that is an acceptable size', () => {
      const connection = new WebSocketConnection(
        new ws(''),
        ConnectionDirection.Outbound,
        createRootLogger(),
      )

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

      const _sendSpy = jest.spyOn(connection, '_send').mockImplementationOnce(() => true)

      expect(connection.send(message)).toBe(true)
      expect(_sendSpy).toHaveBeenCalled()
      connection.close()
    })

    it('should not send a message that exceeds the maximum size', () => {
      const connection = new WebSocketConnection(
        new ws(''),
        ConnectionDirection.Outbound,
        createRootLogger(),
      )

      const message = new IdentifyMessage({
        agent: Buffer.alloc(256, 0).toString(),
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

      const _sendSpy = jest
        .spyOn(connection, '_send')
        .mockImplementationOnce(jest.fn<(data: Buffer) => boolean>())

      expect(connection.send(message)).toBe(false)
      expect(_sendSpy).not.toHaveBeenCalled()
      connection.close()
    })
  })
})
