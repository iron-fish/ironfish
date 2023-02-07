/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { StratumServer } from '../stratumServer'

/**
 * An adapter represents a network transport that accepts connections from
 * clients and routes them into the server.
 */
export interface IStratumAdapter {
  /**
   * Called when the adapter is added to a StratumServer.
   */
  attach(server: StratumServer): void

  /**
   * Called when the adapter should start serving requests to the server
   * This is when an adapter would normally listen on a port for data and
   * create {@link Request } for the routing layer.
   *
   * For example, when an
   * HTTP server starts listening, or an IPC layer opens an IPC socket.
   */
  start(): Promise<void>

  /** Called when the adapter should stop serving requests to the server. */
  stop(): Promise<void>
}
