/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ErrorEvent as WSErrorEvent } from 'ws'
import { WebSocketClient } from './webSocketClient'

export enum NetworkMessageType {
  // Core protocol messages
  Identify = 0,
  Disconnecting = 1,
  SignalRequest = 2,
  Signal = 3,
  CannotSatisfyRequest = 4,
  // Peer discovery-related messages
  PeerListRequest = 20,
  PeerList = 21,
  // Syncing-related messages
  // Block syncing
  GetBlockHeadersRequest = 40,
  GetBlockHeadersResponse = 41,
  GetBlocksRequest = 42,
  GetBlocksResponse = 43,
  // Block gossip
  GetCompactBlockRequest = 60,
  GetCompactBlockResponse = 61,
  GetBlockTransactionsRequest = 62,
  GetBlockTransactionsResponse = 63,
  NewBlockHashes = 64,
  NewCompactBlock = 65,
  // Transaction gossip
  PooledTransactionsRequest = 80,
  PooledTransactionsResponse = 81,
  NewPooledTransactionHashes = 82,
  NewTransactions = 83,
}

export type IsomorphicWebSocketConstructor = typeof WebSocket | typeof WebSocketClient
export type IsomorphicWebSocket = WebSocket | WebSocketClient
export type IsomorphicWebSocketErrorEvent = WSErrorEvent
