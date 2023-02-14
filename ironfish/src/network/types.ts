/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type WSWebSocket from 'ws'
import type { ErrorEvent as WSErrorEvent } from 'ws'

export enum NetworkMessageType {
  Disconnecting = 0,
  CannotSatisfyRequest = 1,
  GetBlocksRequest = 2,
  GetBlocksResponse = 3,
  Identify = 4,
  PeerList = 5,
  PeerListRequest = 6,
  Signal = 7,
  SignalRequest = 8,
  PooledTransactionsRequest = 9,
  PooledTransactionsResponse = 10,
  NewPooledTransactionHashes = 11,
  NewTransactions = 12,
  NewBlockHashes = 13,
  NewCompactBlock = 14,
  GetBlockTransactionsRequest = 15,
  GetBlockTransactionsResponse = 16,
  GetCompactBlockRequest = 17,
  GetCompactBlockResponse = 18,
  GetBlockHeadersRequest = 19,
  GetBlockHeadersResponse = 20,
}

export type IsomorphicWebSocketConstructor = typeof WebSocket | typeof WSWebSocket
export type IsomorphicWebSocket = WebSocket | WSWebSocket
export type IsomorphicWebSocketErrorEvent = WSErrorEvent
