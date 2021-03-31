/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleHasher } from '.'
import { StringSerde } from '../../../../serde'

/**
 * Demo merkle hasher implementation that indicates a range of hashes.
 *
 * Useful for unit testing or displaying demo trees. Assumes the hashes are
 * in ascending order. Takes the left and right side of a hyphen in each hash
 * and combines them.
 */
export default class RangeHasher implements MerkleHasher<string, string, string, string> {
  elementSerde(): StringSerde {
    return new StringSerde()
  }
  hashSerde(): StringSerde {
    return new StringSerde()
  }
  combineHash(depth: number, left: string, right: string): string {
    const leftSplit = left.split('-')
    const rightSplit = right.split('-')
    return leftSplit[0] + '-' + rightSplit[rightSplit.length - 1]
  }

  merkleHash(element: string): string {
    return element
  }
}
