/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Serde } from './Serde'

/**
 * Very simple serializer and equality checker for strings. Used for the test
 * hasher, which uses strings for both elements and hashes.
 */

export default class StringSerde implements Serde<string, string> {
  equals(string1: string, string2: string): boolean {
    return string1 === string2
  }

  serialize(element: string): string {
    return element
  }

  deserialize(data: string): string {
    if (typeof data === 'string') {
      return data
    }
    throw new Error(`cannot deserialize '${typeof data}' to string`)
  }
}
