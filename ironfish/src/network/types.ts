/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ErrorEvent as WSErrorEvent } from 'ws'
import { WebSocketClient } from './webSocketClient'

export enum SubProtocolType {
  Internal = 0,
  PeerDiscovery = 1,
  Sync = 2,
}

export enum InternalSubProtocolMessageType {
  Identify = 0,
  Disconnecting = 1,
  SignalRequest = 2,
  Signal = 2,
}

export enum PeerDiscoverySubProtocolMessageType {
  PeerListRequest = 0,
  PeerList = 1,
}

export enum SyncSubProtocolMessageType {
  CannotSatisfyRequest = 0,
  GetBlockHashesRequest = 1,
  GetBlockHashesResponse = 2,
  GetBlocksRequest = 3,
  GetBlocksResponse = 4,
  PooledTransactionsRequest = 5,
  PooledTransactionsResponse = 6,
  NewPooledTransactionHashes = 7,
  NewTransactions = 8,
  NewBlockHashes = 9,
  NewCompactBlock = 10,
  GetBlockTransactionsRequest = 11,
  GetBlockTransactionsResponse = 12,
  GetCompactBlockRequest = 13,
  GetCompactBlockResponse = 14,
  GetBlockHeadersRequest = 15,
  GetBlockHeadersResponse = 16,
}

export enum NetworkMessageType {
  Disconnecting = 0,
  CannotSatisfyRequest = 1,
  GetBlockHashesRequest = 2,
  GetBlockHashesResponse = 3,
  GetBlocksRequest = 4,
  GetBlocksResponse = 5,
  Identify = 6,
  PeerList = 7,
  PeerListRequest = 8,
  Signal = 9,
  SignalRequest = 10,
  PooledTransactionsRequest = 11,
  PooledTransactionsResponse = 12,
  NewPooledTransactionHashes = 13,
  NewTransactions = 14,
  NewBlockHashes = 15,
  NewCompactBlock = 16,
  GetBlockTransactionsRequest = 17,
  GetBlockTransactionsResponse = 18,
  GetCompactBlockRequest = 19,
  GetCompactBlockResponse = 20,
  GetBlockHeadersRequest = 21,
  GetBlockHeadersResponse = 22,
}

export type IsomorphicWebSocketConstructor = typeof WebSocket | typeof WebSocketClient
export type IsomorphicWebSocket = WebSocket | WebSocketClient
export type IsomorphicWebSocketErrorEvent = WSErrorEvent
