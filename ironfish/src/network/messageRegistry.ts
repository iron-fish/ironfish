/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage } from './messages/disconnecting'
import { GetBlockHashesRequest, GetBlockHashesResponse } from './messages/getBlockHashes'
import { GetBlockHeadersRequest, GetBlockHeadersResponse } from './messages/getBlockHeaders'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import {
  GetBlockTransactionsRequest,
  GetBlockTransactionsResponse,
} from './messages/getBlockTransactions'
import { GetCompactBlockRequest, GetCompactBlockResponse } from './messages/getCompactBlock'
import { IdentifyMessage } from './messages/identify'
import { NetworkMessage } from './messages/networkMessage'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewCompactBlockMessage } from './messages/newCompactBlock'
import { NewPooledTransactionHashes } from './messages/newPooledTransactionHashes'
import { NewTransactionsMessage } from './messages/newTransactions'
import { PeerListMessage } from './messages/peerList'
import { PeerListRequestMessage } from './messages/peerListRequest'
import {
  PooledTransactionsRequest,
  PooledTransactionsResponse,
} from './messages/pooledTransactions'
import { RpcNetworkMessage } from './messages/rpcNetworkMessage'
import { SignalMessage } from './messages/signal'
import { SignalRequestMessage } from './messages/signalRequest'
import { NetworkMessageType } from './types'

export const parseNetworkMessage = (buffer: Buffer): NetworkMessage => {
  const { type, remaining: body } = NetworkMessage.deserializeType(buffer)

  if (isRpcNetworkMessageType(type)) {
    return parseRpcNetworkMessage(type, body)
  }

  return parseGenericNetworkMessage(type, body)
}

export const isRpcNetworkMessageType = (type: NetworkMessageType): boolean => {
  return [
    NetworkMessageType.CannotSatisfyRequest,
    NetworkMessageType.GetBlockHashesRequest,
    NetworkMessageType.GetBlockHashesResponse,
    NetworkMessageType.GetBlocksRequest,
    NetworkMessageType.GetBlocksResponse,
    NetworkMessageType.PooledTransactionsRequest,
    NetworkMessageType.PooledTransactionsResponse,
    NetworkMessageType.GetBlockTransactionsRequest,
    NetworkMessageType.GetBlockTransactionsResponse,
    NetworkMessageType.GetCompactBlockRequest,
    NetworkMessageType.GetCompactBlockResponse,
    NetworkMessageType.GetBlockHeadersRequest,
    NetworkMessageType.GetBlockHeadersResponse,
  ].includes(type)
}

const parseRpcNetworkMessage = (
  type: NetworkMessageType,
  bodyWithHeader: Buffer,
): RpcNetworkMessage => {
  const { rpcId, remaining: body } = RpcNetworkMessage.deserializeHeader(bodyWithHeader)

  switch (type) {
    case NetworkMessageType.CannotSatisfyRequest:
      return CannotSatisfyRequest.deserialize(rpcId)
    case NetworkMessageType.GetBlockHashesRequest:
      return GetBlockHashesRequest.deserialize(body, rpcId)
    case NetworkMessageType.GetBlockHashesResponse:
      return GetBlockHashesResponse.deserialize(body, rpcId)
    case NetworkMessageType.GetBlocksRequest:
      return GetBlocksRequest.deserialize(body, rpcId)
    case NetworkMessageType.GetBlocksResponse:
      return GetBlocksResponse.deserialize(body, rpcId)
    case NetworkMessageType.PooledTransactionsRequest:
      return PooledTransactionsRequest.deserialize(body, rpcId)
    case NetworkMessageType.PooledTransactionsResponse:
      return PooledTransactionsResponse.deserialize(body, rpcId)
    case NetworkMessageType.GetBlockTransactionsRequest:
      return GetBlockTransactionsRequest.deserialize(body, rpcId)
    case NetworkMessageType.GetBlockTransactionsResponse:
      return GetBlockTransactionsResponse.deserialize(body, rpcId)
    case NetworkMessageType.GetCompactBlockRequest:
      return GetCompactBlockRequest.deserialize(body, rpcId)
    case NetworkMessageType.GetCompactBlockResponse:
      return GetCompactBlockResponse.deserialize(body, rpcId)
    case NetworkMessageType.GetBlockHeadersRequest:
      return GetBlockHeadersRequest.deserialize(body, rpcId)
    case NetworkMessageType.GetBlockHeadersResponse:
      return GetBlockHeadersResponse.deserialize(body, rpcId)
    default:
      throw new Error(`Unknown RPC network message type: ${type}`)
  }
}

const parseGenericNetworkMessage = (type: NetworkMessageType, body: Buffer): NetworkMessage => {
  switch (type) {
    case NetworkMessageType.Disconnecting:
      return DisconnectingMessage.deserialize(body)
    case NetworkMessageType.Identify:
      return IdentifyMessage.deserialize(body)
    case NetworkMessageType.PeerList:
      return PeerListMessage.deserialize(body)
    case NetworkMessageType.PeerListRequest:
      return PeerListRequestMessage.deserialize()
    case NetworkMessageType.Signal:
      return SignalMessage.deserialize(body)
    case NetworkMessageType.SignalRequest:
      return SignalRequestMessage.deserialize(body)
    case NetworkMessageType.NewPooledTransactionHashes:
      return NewPooledTransactionHashes.deserialize(body)
    case NetworkMessageType.NewTransactions:
      return NewTransactionsMessage.deserialize(body)
    case NetworkMessageType.NewBlockHashes:
      return NewBlockHashesMessage.deserialize(body)
    case NetworkMessageType.NewCompactBlock:
      return NewCompactBlockMessage.deserialize(body)
    default:
      throw new Error(`Unknown network message type: ${type}`)
  }
}
