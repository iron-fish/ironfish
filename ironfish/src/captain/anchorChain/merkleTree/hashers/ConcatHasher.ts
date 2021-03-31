/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleHasher } from '.'
import { StringSerde } from '../../../../serde'

/**
 * Demo merkle hasher implementation that combines hashes via concatenation.
 *
 * Useful for unit testing or displaying demo trees.
 */
export default class ConcatHasher implements MerkleHasher<string, string, string, string> {
  elementSerde(): StringSerde {
    return new StringSerde()
  }
  hashSerde(): StringSerde {
    return new StringSerde()
  }
  combineHash(depth: number, left: string, right: string): string {
    return left + right
  }
  merkleHash(element: string): string {
    return element
  }
}
