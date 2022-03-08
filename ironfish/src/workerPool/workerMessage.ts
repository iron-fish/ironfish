/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Serializable } from '../common/serializable'

export enum WorkerMessageType {}

export abstract class WorkerMessage implements Serializable {
  id: number
  type: WorkerMessageType

  constructor(id: number, type: WorkerMessageType) {
    this.id = id
    this.type = type
  }

  abstract serialize(): Buffer

  abstract deserialize(buffer: Buffer): Serializable

  abstract getSize(): number

  serializeWithMetadata(): Buffer {
    const bw = bufio.write()
    bw.writeU64(this.id)
    bw.writeBytes(this.serialize())
    return bw.render()
  }
}
