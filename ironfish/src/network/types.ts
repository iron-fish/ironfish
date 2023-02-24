/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ErrorEvent as WSErrorEvent } from 'ws'
import { WebSocketClient } from './webSocketClient'

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
