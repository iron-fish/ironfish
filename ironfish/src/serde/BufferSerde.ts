/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { Serde } from './Serde'

/**
 * A buffer serializer and equality checker
 */
export class BufferSerde implements Serde<Buffer, string> {
  constructor(readonly size: number) {}

  equals(element1: Buffer, element2: Buffer): boolean {
    return element1.equals(element2)
  }

  serialize(element: Buffer): string {
    Assert.isEqual(
      element.length,
      this.size,
      `Attempting to serialize array with ${element.length} bytes, expected ${this.size}`,
    )
    return element.toString('hex').toUpperCase()
  }

  deserialize(data: string): Buffer {
    Assert.isEqual(
      data.length,
      this.size * 2,
      `${JSON.stringify(data)} is not a ${this.size * 2}-character hex string`,
    )
    return Buffer.from(data, 'hex')
  }
}
