/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import hexarray from 'hex-array'
import { zip } from 'lodash'
import { Serde } from './Serde'

/**
 * General-purpose uint8array serializer and equality checker
 */
export default class Uint8ArraySerde implements Serde<Uint8Array, string> {
  constructor(readonly size: number) {}
  equals(element1: Uint8Array, element2: Uint8Array): boolean {
    if (element1.length !== this.size) {
      throw new Error('Attempting to compare inappropriately sized array')
    }
    if (element1.length !== element2.length) {
      return false
    }
    for (const [first, second] of zip(element1, element2)) {
      if (first !== second) {
        return false
      }
    }
    return true
  }

  serialize(element: Uint8Array): string {
    if (element.length !== this.size) {
      throw new Error(
        `Attempting to serialize array with ${element.length} bytes, expected ${this.size}`,
      )
    }
    return hexarray.toString(element)
  }

  deserialize(data: string): Uint8Array {
    if (typeof data !== 'string' || data.length !== this.size * 2) {
      throw new Error(`${JSON.stringify(data)} is not a ${this.size * 2}-character hex string`)
    }
    return hexarray.fromString(data)
  }
}
