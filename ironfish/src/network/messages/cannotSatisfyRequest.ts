/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NetworkMessageType } from '../types'
import { Direction, RpcNetworkMessage } from './rpcNetworkMessage'

export class CannotSatisfyRequest extends RpcNetworkMessage {
  constructor(rpcId: number) {
    super(NetworkMessageType.CannotSatisfyRequest, Direction.Response, rpcId)
  }

  serialize(): Buffer {
    return Buffer.alloc(0)
  }

  static deserialize(rpcId: number): CannotSatisfyRequest {
    return new CannotSatisfyRequest(rpcId)
  }

  getSize(): number {
    return 0
  }
}
