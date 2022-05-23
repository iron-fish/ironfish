/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Serde } from './Serde'
import Uint8ArraySerde from './Uint8ArraySerde'

/**
 * A buffer serializer and equality checker
 */
export class BufferSerde implements Serde<Buffer, string> {
  serde: Uint8ArraySerde

  constructor(readonly size: number) {
    this.serde = new Uint8ArraySerde(size)
  }

  equals(element1: Buffer, element2: Buffer): boolean {
    return this.serde.equals(element1, element2)
  }

  serialize(element: Buffer): string {
    return this.serde.serialize(element)
  }

  deserialize(data: string): Buffer {
    return Buffer.from(this.serde.deserialize(data))
  }
}
