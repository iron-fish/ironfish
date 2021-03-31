/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleHasher } from '.'
import { StringSerde } from '../../../../serde'

/**
 * Simple hasher that encodes the tree structure in its hashes so its easy
 * to test if said structure is correct.
 *
 * Only useful for various types of unit testing.
 */
export default class StructureHasher implements MerkleHasher<string, string, string, string> {
  elementSerde(): StringSerde {
    return new StringSerde()
  }
  hashSerde(): StringSerde {
    return new StringSerde()
  }
  combineHash(depth: number, left: string, right: string): string {
    return `<${left}|${right}-${depth}>`
  }
  merkleHash(element: string): string {
    return element
  }
}
