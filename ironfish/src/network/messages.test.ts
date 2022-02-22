/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isMessage } from '.'
import { Assert } from '..'
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
    try {
      parseMessage('{"Iron": "Fish!"}')
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

    const data = JSON.stringify(msg)
    const output = parseMessage(data)
    const blah = JSON.stringify(output)
    expect(data).toEqual(expect.stringMatching(blah))
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

  it('returns false when there is no payload', () => {
    const msg: PeerListRequest = {
      type: InternalMessageType.peerListRequest,
    }

    expect(isPeerList(msg)).toBeFalsy()
  })

  it("returns false when the parameter's payload is not an object", () => {
    const msg: NoteRequest = {
      type: NodeMessageType.Note,
      payload: {
        position: 3,
      },
    }

    const data = JSON.stringify(msg.payload)
    expect(isMessage(data)).toBeFalsy()
  })
})

describe('isPeerLista', () => {
  it('returns false if message does not have a payload', () => {
  })
})

describe('isPeerListb', () => {
  it('returns false if message does not have a payload', () => {
  })
})

describe('isPeerList', () => {
  it('returns false if message does not have a payload', () => {
  })
})

describe('isPeerList', () => {
  it('returns false if message does not have a payload', () => {
  })
})

describe('isPeerList', () => {
  it('returns false if message does not have a payload', () => {
  })
})
//Other functions to improve, ignoring the 4x conditional return functions
//isNoteRequestPayload more conditionals on return to test, only run once
//isNoteResponsePayload
//isNoteResponse
//isNullifierRequestPayload
//isNullifierResponse
//isNullifierResponsePayload
//isGetBlocksResponse
//isGetBlocksRequest
//isGetBlockHashesResponse
//isGetBlockHashesRequest
//isBlockHash
//isBlock
//isNewBlockPayload - 2 executions only

