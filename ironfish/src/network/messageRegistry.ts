/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { CannotSatisfyRequest } from './messages/cannotSatisfyRequest'
import { DisconnectingMessage } from './messages/disconnecting'
import { GetBlockHashesRequest, GetBlockHashesResponse } from './messages/getBlockHashes'
import { GetBlocksRequest, GetBlocksResponse } from './messages/getBlocks'
import { GossipNetworkMessage } from './messages/gossipNetworkMessage'
import { IdentifyMessage } from './messages/identify'
import { NetworkMessage } from './messages/networkMessage'
import { NewBlockMessage } from './messages/newBlock'
import { NewBlockHashesMessage } from './messages/newBlockHashes'
import { NewBlockV2Message } from './messages/newBlockV2'
import { NewTransactionMessage } from './messages/newTransaction'
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
  } else if (isGossipNetworkMessageType(type)) {
    return parseGossipNetworkMessage(type, body)
  }

  return parseGenericNetworkMessage(type, body)
}

const isRpcNetworkMessageType = (type: NetworkMessageType): boolean => {
  return [
    NetworkMessageType.CannotSatisfyRequest,
    NetworkMessageType.GetBlockHashesRequest,
    NetworkMessageType.GetBlockHashesResponse,
    NetworkMessageType.GetBlocksRequest,
    NetworkMessageType.GetBlocksResponse,
    NetworkMessageType.PooledTransactionsRequest,
    NetworkMessageType.PooledTransactionsResponse,
  ].includes(type)
}

const isGossipNetworkMessageType = (type: NetworkMessageType): boolean => {
  return [NetworkMessageType.NewBlock, NetworkMessageType.NewTransaction].includes(type)
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
    default:
      throw new Error(`Unknown RPC network message type: ${type}`)
  }
}

const parseGossipNetworkMessage = (
  type: NetworkMessageType,
  bodyWithHeader: Buffer,
): GossipNetworkMessage => {
  const { nonce, remaining: body } = GossipNetworkMessage.deserializeHeader(bodyWithHeader)

  switch (type) {
    case NetworkMessageType.NewBlock:
      return NewBlockMessage.deserialize(body, nonce)
    case NetworkMessageType.NewTransaction:
      return NewTransactionMessage.deserialize(body, nonce)
    default:
      throw new Error(`Unknown gossip network message type: ${type}`)
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
    case NetworkMessageType.NewBlockHashes:
      return NewBlockHashesMessage.deserialize(body)
    case NetworkMessageType.NewBlockV2:
      return NewBlockV2Message.deserialize(body)
    default:
      throw new Error(`Unknown network message type: ${type}`)
  }
}
