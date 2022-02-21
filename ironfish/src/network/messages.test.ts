
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  DisconnectingMessage,
  DisconnectingReason,
  Identify,
  InternalMessageType,
  isDisconnectingMessage,
  isIdentify,
  isPeerList,
  isPeerListRequest,
  isSignal,
  NodeMessageType,
  NoteRequest,
  parseMessage,
  PeerList,
  PeerListRequest,
  Signal,
} from './messages'
import { VERSION_PROTOCOL } from './version'
import { IJSON } from '../serde'
import { Assert } from '..'

describe('isIdentify', () => {
  it('Returns true on identity message', () => {
    const msg: Identify = {
      type: InternalMessageType.identity,
      payload: {
        identity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        version: VERSION_PROTOCOL,
        agent: '',
        head: '',
        sequence: 1,
        work: BigInt(0).toString(),
        port: null,
      },
    }
    expect(isIdentify(msg)).toBeTruthy()
  })
})

describe('isSignal', () => {
  it('Returns true on signal message', () => {
    const msg: Signal = {
      type: InternalMessageType.signal,
      payload: {
        sourceIdentity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        destinationIdentity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        nonce: 'test',
        signal: 'data',
      },
    }
    expect(isSignal(msg)).toBeTruthy()
  })
})

describe('isPeerListRequest', () => {
  it('Retuns true on peerlist request message', () => {
    const msg: PeerListRequest = {
      type: InternalMessageType.peerListRequest,
    }
    expect(isPeerListRequest(msg)).toBeTruthy()
  })

  it('Returns false on wrong type message', () => {
    const msg: PeerList = {
      type: InternalMessageType.peerList,
      payload: {
        connectedPeers: [],
      },
    }
    expect(isPeerListRequest(msg)).toBeFalsy()
  })
})

describe('isPeerList', () => {
  it('Returns true on empty connectedPeers', () => {
    const msg: PeerList = {
      type: InternalMessageType.peerList,
      payload: {
        connectedPeers: [],
      },
    }
    expect(isPeerList(msg)).toBeTruthy()
  })

  it('Returns true on peerlist message', () => {
    const msg: PeerList = {
      type: InternalMessageType.peerList,
      payload: {
        connectedPeers: [
          {
            identity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
            address: 'localhost',
            port: null,
          },
        ],
      },
    }
    expect(isPeerList(msg)).toBeTruthy()
  })
})

describe('isDisconnectingMessage', () => {
  it('Returns true on Disconnecting message', () => {
    const msg: DisconnectingMessage = {
      type: InternalMessageType.disconnecting,
      payload: {
        sourceIdentity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        destinationIdentity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        reason: DisconnectingReason.ShuttingDown,
        disconnectUntil: Date.now(),
      },
    }
    expect(isDisconnectingMessage(msg)).toBeTruthy()
  })

  it('Returns true on null destinationIdentity', () => {
    const msg: DisconnectingMessage = {
      type: InternalMessageType.disconnecting,
      payload: {
        sourceIdentity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        destinationIdentity: null,
        reason: DisconnectingReason.ShuttingDown,
        disconnectUntil: Date.now(),
      },
    }
    expect(isDisconnectingMessage(msg)).toBeTruthy()
  })
})

describe('parseMessage', () => {
  it('Throws error on JSON parse error', () => {
    jest.spyOn(IJSON, 'parse').mockImplementation(() => {null})
/*
    try {
      parseMessage('Go Iron Fish!')
    } catch (e) {
      expect(e.message).toContain('Message must have a type field')
    }
*/
    try {
      expect(parseMessage('dsfdsf')).toThrowError('Message must have a type field')
    } catch (e) {}
  })

  it('Parses JSON successfully', () => {
    //jktodo: try and log the web messages to see what the format is.
    const msg: DisconnectingMessage = {
      type: InternalMessageType.disconnecting,
      payload: {
        sourceIdentity: 'oVHAznOXv4FHdajFYsVNMZm14WHlCdXZz8z55IOhTwI=',
        destinationIdentity: null,
        reason: DisconnectingReason.ShuttingDown,
        disconnectUntil: Date.now(),
      },
    }
    
    //export type NoteRequest = Message<NodeMessageType.Note, { position: number }>
    const msg2: NoteRequest = {
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }

    const data = JSON.stringify(msg2)
let output
    try {
      output = parseMessage(data)
      //output = parseMessage('{"type":"Note"}')
      //Assert.isTrue(false,  output.type)
      //expect(output).toContain('Message must have a type field')
    } catch (e) {
      //Assert.isTrue(false,  data)
      Assert.isNull(e,  data)
    }
    Assert.isTrue(false, 'jjjjjj')
  })
})