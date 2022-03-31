/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  GetBlockHashesRequest,
  GetBlockHashesResponse,
  InternalMessageType,
  isGetBlockHashesRequest,
  isGetBlockHashesResponse,
  isMessage,
  isPeerListRequest,
  NodeMessageType,
  parseMessage,
  PeerListRequest,
} from './messages'

describe('isPeerListRequest', () => {
  it('Retuns true on peerlist request message', () => {
    const msg: PeerListRequest = {
      type: InternalMessageType.peerListRequest,
    }
    expect(isPeerListRequest(msg)).toBeTruthy()
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

    expect(() => parseMessage(output)).toThrow('Message must have a type field')
  })

  it('Parses json successfully', () => {
    const msg: GetBlockHashesRequest = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        start: 0,
        limit: 1,
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
    const msg: GetBlockHashesRequest = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        limit: 3,
        start: 3,
      },
    }

    const data = JSON.stringify(msg)
    expect(isMessage(data)).toBeFalsy()
  })

  it('returns false when the payload is not an object', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
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
      type: NodeMessageType.GetBlockHashes,
      payload: {
        position: 3,
      },
    }

    expect(isMessage(msg)).toBeTruthy()
  })
})

describe('isGetBlockHashesResponse', () => {
  it('returns false if the message type is not GetBlockHashes', () => {
    const stringArray = ['blockHash1', 'blockHash2']

    const msg = {
      type: NodeMessageType.NewBlock,
      payload: {
        blocks: stringArray,
      },
    }
    expect(isGetBlockHashesResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if message does not have a payload field', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
    }
    expect(isGetBlockHashesResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if the payload does not have a blocks field', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        position: 3,
      },
    }
    expect(isGetBlockHashesResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if the blocks field is not an array', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        blocks: 'blockHash1',
      },
    }

    expect(isGetBlockHashesResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if GetBlockHashesResponse message with invalid hash types received', () => {
    const stringArray = ['blockHash1', undefined]

    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        blocks: stringArray,
      },
    }

    expect(isGetBlockHashesResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns true if GetBlockHashesResponse message with hashes received', () => {
    const stringArray = ['blockHash1', 'blockHash2']

    const msg: GetBlockHashesResponse = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        blocks: stringArray,
      },
    }

    expect(isGetBlockHashesResponse(msg)).toBeTruthy()
  }, 10000)
})

describe('isGetBlockHashesRequest', () => {
  it('returns false if the object is undefined', () => {
    expect(isGetBlockHashesRequest(undefined)).toBeFalsy()
  })

  it('returns false if message does not have the start field', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        limit: 3,
      },
    }
    expect(isGetBlockHashesRequest(msg.payload)).toBeFalsy()
  })

  it('returns false if payload.start is not a string or number', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        start: null,
        limit: 3,
      },
    }
    expect(isGetBlockHashesRequest(msg.payload)).toBeFalsy()
  })

  it('returns false if message does not have the limit field', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        start: 3,
      },
    }
    expect(isGetBlockHashesRequest(msg.payload)).toBeFalsy()
  })

  it('returns false if payload.limit is not a number', () => {
    const msg = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        start: 3,
        limit: 'three',
      },
    }
    expect(isGetBlockHashesRequest(msg.payload)).toBeFalsy()
  })

  it('returns true if GetBlockHashesRequest payload received', () => {
    const msg: GetBlockHashesRequest = {
      type: NodeMessageType.GetBlockHashes,
      payload: {
        start: 3,
        limit: 3,
      },
    }
    expect(isGetBlockHashesRequest(msg.payload)).toBeTruthy()
  })
})
