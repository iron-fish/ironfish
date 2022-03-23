/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Serializable } from '../../common/serializable'

export enum NetworkMessageType {}

export abstract class NetworkMessage implements Serializable {
  private static id = 0

  readonly networkId: number
  readonly type: NetworkMessageType

  constructor(type: NetworkMessageType, networkId?: number) {
    this.networkId = networkId ?? NetworkMessage.id++
    this.type = type
  }

  abstract serialize(): Buffer
  abstract getSize(): number
}
