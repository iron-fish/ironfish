/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage } from './messages/disconnecting'
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
      return CannotSatisfyRequest.deserializePayload(rpcId)
    case NetworkMessageType.GetBlocksRequest:
      return GetBlocksRequest.deserializePayload(body, rpcId)
    case NetworkMessageType.GetBlocksResponse:
      return GetBlocksResponse.deserializePayload(body, rpcId)
    case NetworkMessageType.PooledTransactionsRequest:
      return PooledTransactionsRequest.deserializePayload(body, rpcId)
    case NetworkMessageType.PooledTransactionsResponse:
      return PooledTransactionsResponse.deserializePayload(body, rpcId)
    case NetworkMessageType.GetBlockTransactionsRequest:
      return GetBlockTransactionsRequest.deserializePayload(body, rpcId)
    case NetworkMessageType.GetBlockTransactionsResponse:
      return GetBlockTransactionsResponse.deserializePayload(body, rpcId)
    case NetworkMessageType.GetCompactBlockRequest:
      return GetCompactBlockRequest.deserializePayload(body, rpcId)
    case NetworkMessageType.GetCompactBlockResponse:
      return GetCompactBlockResponse.deserializePayload(body, rpcId)
    case NetworkMessageType.GetBlockHeadersRequest:
      return GetBlockHeadersRequest.deserializePayload(body, rpcId)
    case NetworkMessageType.GetBlockHeadersResponse:
      return GetBlockHeadersResponse.deserializePayload(body, rpcId)
    default:
      throw new Error(`Unknown RPC network message type: ${type}`)
  }
}

const parseGenericNetworkMessage = (type: NetworkMessageType, body: Buffer): NetworkMessage => {
  switch (type) {
    case NetworkMessageType.Disconnecting:
      return DisconnectingMessage.deserializePayload(body)
    case NetworkMessageType.Identify:
      return IdentifyMessage.deserializePayload(body)
    case NetworkMessageType.PeerList:
      return PeerListMessage.deserializePayload(body)
    case NetworkMessageType.PeerListRequest:
      return PeerListRequestMessage.deserializePayload()
    case NetworkMessageType.Signal:
      return SignalMessage.deserializePayload(body)
    case NetworkMessageType.SignalRequest:
      return SignalRequestMessage.deserializePayload(body)
    case NetworkMessageType.NewPooledTransactionHashes:
      return NewPooledTransactionHashes.deserializePayload(body)
    case NetworkMessageType.NewTransactions:
      return NewTransactionsMessage.deserializePayload(body)
    case NetworkMessageType.NewBlockHashes:
      return NewBlockHashesMessage.deserializePayload(body)
    case NetworkMessageType.NewCompactBlock:
      return NewCompactBlockMessage.deserializePayload(body)
    default:
      throw new Error(`Unknown network message type: ${type}`)
  }
}
