/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import Serde, { JsonSerializable } from '../../../../serde'
/**
 * Interface for objects that can calculate the hashes of elements.
 *
 */
export interface MerkleHasher<E, H, SE extends JsonSerializable, SH extends JsonSerializable> {
  /**
   * Serializer and equality checker for the notes in the tree
   */
  elementSerde: () => Serde<E, SE>

  /**
   * Serializer and equality checker for the hashes in the tree
   */
  hashSerde: () => Serde<H, SH>

  /**
   * Get the hash of a given element
   */
  merkleHash: (element: E) => H

  /**
   * Combine two hashes to get the parent hash
   */
  combineHash: (depth: number, left: H, right: H) => H
}
