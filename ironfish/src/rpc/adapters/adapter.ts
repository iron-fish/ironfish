/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcServer } from '../server'

/**
 * An adapter represents a network transport that accepts incoming requests
 * and routes them into the router.
 */
export interface IAdapter {
  /**
   * Called when the adapter has been added to an RpcServer.
   * This lets you get access to both the RpcServer, and the
   * node on the server if you want to access anything like
   * configuration.
   */
  attach(server: RpcServer): Promise<void> | void

  /**
   * Called when the adapter has been removed from an RpcServer.
   * This lets you clean up state you stored in attach()
   */
  unattach(): Promise<void> | void

  /**
   * Called when the adapter should start serving requests to the router
   * This is when an adapter would normally listen on a port for data and
   * create {@link Request } for the routing layer.
   *
   * For example, when an
   * HTTP server starts listening, or an IPC layer opens an IPC socket.
   */
  start(): Promise<void>

  /** Called when the adapter should stop serving requests to the routing layer. */
  stop(): Promise<void>
}
