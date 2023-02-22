/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { Serializable } from '../../common/serializable'
import { Identity } from '../identity'
import {
  InternalSubProtocolMessageType,
  NetworkMessageType,
  PeerDiscoverySubProtocolMessageType,
  SubProtocolType,
  SyncSubProtocolMessageType,
} from '../types'

export function displayNetworkMessageType(type: NetworkMessageType): string {
  return `${NetworkMessageType[type]} (${type})`
}

const protocolAndTypeToType: Record<number, Record<number, NetworkMessageType>> = {
  [SubProtocolType.Internal]: {
    [InternalSubProtocolMessageType.Identify]: NetworkMessageType.Identify,
    [InternalSubProtocolMessageType.Disconnecting]: NetworkMessageType.Disconnecting,
    [InternalSubProtocolMessageType.SignalRequest]: NetworkMessageType.SignalRequest,
    [InternalSubProtocolMessageType.Signal]: NetworkMessageType.Signal,
  },
  [SubProtocolType.PeerDiscovery]: {
    [PeerDiscoverySubProtocolMessageType.PeerListRequest]: NetworkMessageType.PeerListRequest,
    [PeerDiscoverySubProtocolMessageType.PeerList]: NetworkMessageType.PeerList,
  },
  [SubProtocolType.Sync]: {
    [SyncSubProtocolMessageType.CannotSatisfyRequest]: NetworkMessageType.CannotSatisfyRequest,
    [SyncSubProtocolMessageType.GetBlockHashesRequest]:
      NetworkMessageType.GetBlockHashesRequest,
    [SyncSubProtocolMessageType.GetBlockHashesResponse]:
      NetworkMessageType.GetBlockHashesResponse,
    [SyncSubProtocolMessageType.GetBlocksRequest]: NetworkMessageType.GetBlocksRequest,
    [SyncSubProtocolMessageType.GetBlocksResponse]: NetworkMessageType.GetBlocksResponse,
    [SyncSubProtocolMessageType.PooledTransactionsRequest]:
      NetworkMessageType.PooledTransactionsRequest,
    [SyncSubProtocolMessageType.PooledTransactionsResponse]:
      NetworkMessageType.PooledTransactionsResponse,
    [SyncSubProtocolMessageType.NewPooledTransactionHashes]:
      NetworkMessageType.NewPooledTransactionHashes,
    [SyncSubProtocolMessageType.NewTransactions]: NetworkMessageType.NewTransactions,
    [SyncSubProtocolMessageType.NewBlockHashes]: NetworkMessageType.NewBlockHashes,
    [SyncSubProtocolMessageType.NewCompactBlock]: NetworkMessageType.NewCompactBlock,
    [SyncSubProtocolMessageType.GetBlockTransactionsRequest]:
      NetworkMessageType.GetBlockTransactionsRequest,
    [SyncSubProtocolMessageType.GetBlockTransactionsResponse]:
      NetworkMessageType.GetBlockTransactionsResponse,
    [SyncSubProtocolMessageType.GetCompactBlockRequest]:
      NetworkMessageType.GetCompactBlockRequest,
    [SyncSubProtocolMessageType.GetCompactBlockResponse]:
      NetworkMessageType.GetCompactBlockResponse,
    [SyncSubProtocolMessageType.GetBlockHeadersRequest]:
      NetworkMessageType.GetBlockHeadersRequest,
    [SyncSubProtocolMessageType.GetBlockHeadersResponse]:
      NetworkMessageType.GetBlockHeadersResponse,
  },
}

const typeToProtocolAndType: Record<NetworkMessageType, { protocol: number; type: number }> = {
  [NetworkMessageType.Disconnecting]: {
    protocol: SubProtocolType.Internal,
    type: InternalSubProtocolMessageType.Disconnecting,
  },
  [NetworkMessageType.CannotSatisfyRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.CannotSatisfyRequest,
  },
  [NetworkMessageType.GetBlockHashesRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlockHashesRequest,
  },
  [NetworkMessageType.GetBlockHashesResponse]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlockHashesResponse,
  },
  [NetworkMessageType.GetBlocksRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlocksRequest,
  },
  [NetworkMessageType.GetBlocksResponse]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlocksResponse,
  },
  [NetworkMessageType.Identify]: {
    protocol: SubProtocolType.Internal,
    type: InternalSubProtocolMessageType.Identify,
  },
  [NetworkMessageType.PeerList]: {
    protocol: SubProtocolType.PeerDiscovery,
    type: PeerDiscoverySubProtocolMessageType.PeerList,
  },
  [NetworkMessageType.PeerListRequest]: {
    protocol: SubProtocolType.PeerDiscovery,
    type: PeerDiscoverySubProtocolMessageType.PeerListRequest,
  },
  [NetworkMessageType.Signal]: {
    protocol: SubProtocolType.Internal,
    type: InternalSubProtocolMessageType.Signal,
  },
  [NetworkMessageType.SignalRequest]: {
    protocol: SubProtocolType.Internal,
    type: InternalSubProtocolMessageType.SignalRequest,
  },
  [NetworkMessageType.PooledTransactionsRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.PooledTransactionsRequest,
  },
  [NetworkMessageType.PooledTransactionsResponse]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.PooledTransactionsResponse,
  },
  [NetworkMessageType.NewPooledTransactionHashes]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.NewPooledTransactionHashes,
  },
  [NetworkMessageType.NewTransactions]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.NewTransactions,
  },
  [NetworkMessageType.NewBlockHashes]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.NewBlockHashes,
  },
  [NetworkMessageType.NewCompactBlock]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.NewCompactBlock,
  },
  [NetworkMessageType.GetBlockTransactionsRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlockTransactionsRequest,
  },
  [NetworkMessageType.GetBlockTransactionsResponse]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlockTransactionsResponse,
  },
  [NetworkMessageType.GetCompactBlockRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetCompactBlockRequest,
  },
  [NetworkMessageType.GetCompactBlockResponse]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetCompactBlockResponse,
  },
  [NetworkMessageType.GetBlockHeadersRequest]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlockHeadersRequest,
  },
  [NetworkMessageType.GetBlockHeadersResponse]: {
    protocol: SubProtocolType.Sync,
    type: SyncSubProtocolMessageType.GetBlockHeadersResponse,
  },
}

export abstract class NetworkMessage implements Serializable {
  readonly type: NetworkMessageType

  constructor(type: NetworkMessageType) {
    this.type = type
  }

  abstract serialize(): Buffer
  abstract getSize(): number

  static deserializeType(
    buffer: Buffer,
    supportsSubprotocols: boolean,
  ): { type: NetworkMessageType; remaining: Buffer } {
    const br = bufio.read(buffer, true)
    let type
    if (!supportsSubprotocols) {
      type = br.readU8()
    } else {
      const protocol = br.readU8()
      const protocolType = br.readU8()
      type = protocolAndTypeToType[protocol][protocolType]
    }
    return { type, remaining: br.readBytes(br.left()) }
  }

  serializeWithMetadata(supportsSubprotocols: boolean): Buffer {
    const headerSize = supportsSubprotocols ? 2 : 1
    const bw = bufio.write(headerSize + this.getSize())
    if (!supportsSubprotocols) {
      bw.writeU8(this.type)
    } else {
      const { protocol, type } = typeToProtocolAndType[this.type]
      bw.writeU8(protocol)
      bw.writeU8(type)
    }
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}

/**
 * A message that we have received from a peer, identified by that peer's
 * identity.
 */
export interface IncomingPeerMessage<M extends NetworkMessage> {
  peerIdentity: Identity
  message: M
}
