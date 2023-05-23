/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { NetworkMessage } from '../../network/messages/networkMessage'
import { RpcNetworkMessage } from '../../network/messages/rpcNetworkMessage'
import { WorkerMessage } from '../../workerPool/tasks/workerMessage'

export function serializePayloadToBuffer(
  message: NetworkMessage | RpcNetworkMessage | WorkerMessage,
): Buffer {
  const bw = bufio.write(message.getSize())
  message.serializePayload(bw)

  return bw.render()
}
