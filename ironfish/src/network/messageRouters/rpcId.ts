/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Keep track of the next ID. Kept in this simple module to aid in mocking
 * during testing.
 */

export type RpcId = number
export const RPC_TIMEOUT_MILLIS = 30000

let lastUsedRpcId = 0

/**
 * Generate an RPC ID for a new outgoing Request
 */
export function nextRpcId(): RpcId {
  lastUsedRpcId += 1
  return lastUsedRpcId
}

/**
 * Get the number of milliseconds a rpc call should wait for a response before
 * timing out.
 */
export function rpcTimeoutMillis(): number {
  return RPC_TIMEOUT_MILLIS
}
