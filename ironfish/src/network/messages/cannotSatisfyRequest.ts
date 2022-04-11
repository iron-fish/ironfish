/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Direction } from '../messageRouters'
import { NetworkMessageType } from './networkMessage'
import { RpcNetworkMessage } from './rpcNetworkMessage'

export class CannotSatisfyRequest extends RpcNetworkMessage {
  constructor(rpcId: number) {
    super(NetworkMessageType.CannotSatisfyRequest, Direction.Response, rpcId)
  }

  serialize(): Buffer {
    return Buffer.from('')
  }

  static deserialize(rpcId: number): CannotSatisfyRequest {
    return new CannotSatisfyRequest(rpcId)
  }
}
