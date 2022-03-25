/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createNodeTest, useBlockWithTx } from '../testUtilities'
import {
  DisconnectingMessage,
  DisconnectingReason,
  GetBlockHashesRequest,
  GetBlockHashesResponse,
  GetBlocksRequest,
  GetBlocksResponse,
  Identify,
  InternalMessageType,
  isDisconnectingMessage,
  isGetBlockHashesRequest,
  isGetBlockHashesResponse,
  isGetBlocksRequest,
  isGetBlocksResponse,
  isIdentify,
  isMessage,
  isPeerList,
  isPeerListRequest,
  isSignal,
  NodeMessageType,
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

describe('isGetBlocksResponse', () => {
  const nodeTest = createNodeTest()

  it('returns false if the message type is not GetBlocks', async () => {
    const { block } = await useBlockWithTx(nodeTest.node)
    const serialized = nodeTest.strategy.blockSerde.serialize(block)
    const blockArray = [serialized, serialized]

    const msg = {
      type: NodeMessageType.NewBlock,
      payload: {
        blocks: blockArray,
      },
    }
    expect(isGetBlocksResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if message does not have a payload field', () => {
    const msg = {
      type: NodeMessageType.GetBlocks,
    }
    expect(isGetBlocksResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if the payload does not have a blocks field', () => {
    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        position: 3,
      },
    }
    expect(isGetBlocksResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if the blocks field is not an array', async () => {
    const { block } = await useBlockWithTx(nodeTest.node)
    const serialized = nodeTest.strategy.blockSerde.serialize(block)

    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        blocks: serialized,
      },
    }

    expect(isGetBlocksResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns false if GetBlocksResponse message with invalid blocks received', async () => {
    const { block } = await useBlockWithTx(nodeTest.node)
    const serialized0 = nodeTest.strategy.blockSerde.serialize(block)

    const blockArray = [serialized0, undefined]

    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        blocks: blockArray,
      },
    }

    expect(isGetBlocksResponse(msg)).toBeFalsy()
  }, 10000)

  it('returns true if GetBlocksResponse message with valid blocks received', async () => {
    const { block } = await useBlockWithTx(nodeTest.node)
    const serialized = nodeTest.strategy.blockSerde.serialize(block)
    const blockArray = [serialized, serialized]

    const msg: GetBlocksResponse = {
      type: NodeMessageType.GetBlocks,
      payload: {
        blocks: blockArray,
      },
    }

    expect(isGetBlocksResponse(msg)).toBeTruthy()
  }, 10000)
})

describe('isGetBlocksRequest', () => {
  it('returns false if the object is undefined', () => {
    expect(isGetBlocksRequest(undefined)).toBeFalsy()
  })

  it('returns false if message does not have the start field', () => {
    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        limit: 3,
      },
    }
    expect(isGetBlocksRequest(msg.payload)).toBeFalsy()
  })

  it('returns false if payload.start is not a string or number', () => {
    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        start: null,
        limit: 3,
      },
    }
    expect(isGetBlocksRequest(msg.payload)).toBeFalsy()
  })

  it('returns false if message does not have the limit field', () => {
    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        start: 3,
      },
    }
    expect(isGetBlocksRequest(msg.payload)).toBeFalsy()
  })

  it('returns false if payload.limit is not a number', () => {
    const msg = {
      type: NodeMessageType.GetBlocks,
      payload: {
        start: 3,
        limit: 'three',
      },
    }
    expect(isGetBlocksRequest(msg.payload)).toBeFalsy()
  })

  it('returns true if GetBlocksRequest payload received', () => {
    const msg: GetBlocksRequest = {
      type: NodeMessageType.GetBlocks,
      payload: {
        start: 3,
        limit: 3,
      },
    }
    expect(isGetBlocksRequest(msg.payload)).toBeTruthy()
  })
})

describe('isGetBlockHashesResponse', () => {
  it('returns false if the message type is not GetBlockHashes', () => {
    const stringArray = ['blockHash1', 'blockHash2']

    const msg = {
      type: NodeMessageType.GetBlocks,
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
