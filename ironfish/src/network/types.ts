/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type WSWebSocket from 'ws'
import type { ErrorEvent as WSErrorEvent } from 'ws'

export enum NetworkMessageType {
  Disconnecting = 0,
  CannotSatisfyRequest = 1,
  GetBlockHashesRequest = 2,
  GetBlockHashesResponse = 3,
  GetBlocksRequest = 4,
  GetBlocksResponse = 5,
  Identify = 6,
  NewBlock = 7,
  NewTransaction = 8,
  PeerList = 9,
  PeerListRequest = 10,
  Signal = 11,
  SignalRequest = 12,
}

// Enums contain bi-directional mappings so filter out duplicate enum keys
// This is used for some cases where we need to do some action for each message type
export const NetworkMessageTypeList = Object.keys(NetworkMessageType)
  .map((k) => parseInt(k))
  .filter((k) => !isNaN(k))

export type IsomorphicWebSocketConstructor = typeof WebSocket | typeof WSWebSocket
export type IsomorphicWebSocket = WebSocket | WSWebSocket
export type IsomorphicWebSocketErrorEvent = WSErrorEvent
