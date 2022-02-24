/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 
import { Assert } from '..'
import {
  DisconnectingMessage,
  DisconnectingReason,
  Identify,
  InternalMessageType,
  isDisconnectingMessage,
  isIdentify,
  isMessage,
  isNoteRequestPayload,
  isNoteResponse,
  isNoteResponsePayload,
  isNullifierRequestPayload,
  isPeerList,
  isPeerListRequest,
  isSignal,
  NodeMessageType,
  NoteRequest,
  NoteResponse,
  NullifierRequest,
  parseMessage,
  PeerList,
  PeerListRequest,
  Signal,
} from './messages'
import { VERSION_PROTOCOL } from './version'
import { Direction } from './messageRouters'

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

  it('Returns false on a message without a payload', () => {
    const msg: PeerListRequest = {
      type: InternalMessageType.peerListRequest,
    }

    expect(isPeerList(msg)).toBeFalsy()
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
  it('Throws error when no type field found in the json', () => {
    const msg = {
      payload: {
        position: 3,
      },
    }
    
    const output = JSON.stringify(msg)

    try {
      parseMessage(output)
      //Ensure we are not reporting a false positive
      Assert.isFalse(true, 'parseMessage found a type field')
    } catch (e) {
      if (!(e instanceof Error)) {
        throw e
      }
      expect(e.message).toContain('Message must have a type field')
    }
  })

  it('Parses json successfully', () => {
    const msg: NoteRequest = {
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }

    const firstJson = JSON.stringify(msg)
    const output = parseMessage(firstJson)
    const secondJson = JSON.stringify(output)
    expect(firstJson).toEqual(expect.stringMatching(secondJson))
  })
})

describe('isMessage', () => {
  it('returns false on null parameter', () => {
    expect(isMessage(null)).toBeFalsy()
  })

  it('returns false when parameter is not an object', () => {
    const msg: NoteRequest = {
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }

    const data = JSON.stringify(msg)
    expect(isMessage(data)).toBeFalsy()
  })

  it('returns false when the payload is not an object', () => {
    const msg = {
      type: NodeMessageType.Note,
      payload: 3,
      }

    expect(isMessage(msg)).toBeFalsy()
  })

  it('returns false when the message type is not a string', () => {
    const msg = {
      type: 0,
      payload: {
        position: 3,
      },
    }

    expect(isMessage(msg)).toBeFalsy()
  })

  it('returns true when the message type is a string', () => {
    const msg = {
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }

    expect(isMessage(msg)).toBeTruthy()
  })
})

describe('isNoteRequestPayload', () => {
  it('returns false if the object is undefined', () => {
    expect(isNoteRequestPayload(undefined)).toBeFalsy()
  })

  it('returns false if message does not have the position field', () => {
    const msg = {
      type: NodeMessageType.Note,
      payload: {
        location: 3,
      },
    }
    expect(isNoteRequestPayload(msg.payload)).toBeFalsy()
  })

  it('returns false if payload.position is not a number', () => {
    const msg = {
      type: NodeMessageType.Note,
      payload: {
        position: '3',
      },
    }
    expect(isNoteRequestPayload(msg.payload)).toBeFalsy()
  })

  it('returns true if NoteRequest message received', () => {
    const msg: NoteRequest = {
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }
    expect(isNoteRequestPayload(msg.payload)).toBeTruthy()
  })
})

describe('isNoteResponsePayload', () => {
  it('returns false if the object is undefined', () => {
    expect(isNoteResponsePayload(undefined)).toBeFalsy()
  })

  it('returns false if message does not have a note field', () => {
    const msg = {
      rpcId: 1,
      direction: Direction.response,
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }
    expect(isNoteResponsePayload(msg.payload)).toBeFalsy()
  })

  it('returns false if message does not have a position field', () => {
    const msg = {
      rpcId: 1,
      direction: Direction.response,
      type: NodeMessageType.Note,
      payload: {
        note: 'someString',
      },
    }
    expect(isNoteResponsePayload(msg.payload)).toBeFalsy()
  })

  it('returns false if payload.position is not a number', () => {
    const msg = {
      rpcId: 1,
      direction: Direction.response,
      type: NodeMessageType.Note,
      payload: {
        note: 'someString',
        position: '3',
      },
    }
    expect(isNoteResponsePayload(msg.payload)).toBeFalsy()
  })

  it('returns true if NoteResponse message received', () => {
    const msg: NoteResponse<string> = {
      rpcId: 1,
      direction: Direction.response,
      type: NodeMessageType.Note,
      payload: {
        note: 'someString',
        position: 3,
      },
    }
    expect(isNoteResponsePayload(msg.payload)).toBeTruthy()
  })
})

describe('isNoteResponse', () => {
  it('returns false if the message type is not Note', () => {
    const msg = {
      type: NodeMessageType.Nullifier,
      payload: {
        position: 3,
      },
    }
    expect(isNoteResponse(msg)).toBeFalsy()
  })

  it('returns false if message does not have a payload field', () => {
    const msg = {
      type: NodeMessageType.Note,
    }
    expect(isNoteResponse(msg)).toBeFalsy()
  })

  it('returns false if the payload is not for a valid note', () => {
    const msg = {
      type: NodeMessageType.Note,
      payload: {
        position: '3',
      },
    }
    expect(isNoteResponse(msg)).toBeFalsy()
  })

  it('returns true if NoteResponse message received', () => {
    const msg: NoteResponse<string> = {
      rpcId: 1,
      direction: Direction.response,
      type: NodeMessageType.Note,
      payload: {
        note: 'someString',
        position: 3,
      },
    }
    expect(isNoteResponse(msg)).toBeTruthy()
  })
})

//jktodo this needs work!
describe('isNullifierRequestPayload', () => {
  it('returns false if the object is undefined', () => {
    expect(isNullifierRequestPayload(undefined)).toBeFalsy()
  })

  it('returns false if message does not have a payload field', () => {
    const msg = {
      type: NodeMessageType.Nullifier,
    }
    expect(isNullifierRequestPayload(msg)).toBeFalsy()
  })

  it('returns false if payload.position is not a number', () => {
    const msg = {
      type: NodeMessageType.Nullifier,
      payload: { position: 'three' },
    }
    expect(isNullifierRequestPayload(msg)).toBeFalsy()
  })

  it('returns true on nullifier message', () => {
    const msg: NullifierRequest = {
      type: NodeMessageType.Nullifier,
      payload: { position: 3.0 },
    }
    expect(isNullifierRequestPayload(msg)).toBeFalsy()
  })
})

describe('test', () => {
  it('returns false', () => {
    // toBeTruthy()
    expect(isNoteResponsePayload(undefined)).toBeFalsy()
  })
})

//isNullifierResponse
//isNullifierResponsePayload
//isGetBlocksResponse
//isGetBlocksRequest
//isGetBlockHashesResponse
//isGetBlockHashesRequest
//isBlockHash
//isBlock
//isNewBlockPayload - 2 executions only

//Other functions to improve, they mostly have multiple conditional returns
//isPayloadMessage
//isIdentify
//isSignalRequest
//isSignal
//isPeerList
