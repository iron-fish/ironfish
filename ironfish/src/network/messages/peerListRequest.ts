/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NetworkMessageType } from '../types'
import { NetworkMessage } from './networkMessage'

export class PeerListRequestMessage extends NetworkMessage {
  constructor() {
    super(NetworkMessageType.PeerListRequest)
  }

  serialize(): Buffer {
    return Buffer.alloc(0)
  }

  static deserialize(): PeerListRequestMessage {
    return new PeerListRequestMessage()
  }

  getSize(): number {
    return 0
  }
}
