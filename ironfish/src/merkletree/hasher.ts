/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { OutputDescription as NativeOutputDescription } from '@ironfish/rust-nodejs'
import {
  OutputDescription,
  OutputDescriptionHash,
  OutputDescriptionHashSerde,
  OutputDescriptionSerde,
  SerializedOutputDescription,
  SerializedOutputDescriptionHash,
} from '../primitives/outputDescription'
import { StringSerde } from '../serde'
import { JsonSerializable, Serde } from '../serde'

/**
 * Interface for objects that can calculate the hashes of elements.
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

/**
 * Hasher implementation for notes to satisfy the MerkleTree requirements.
 */
export class NoteCommitmentHasher
  implements
    MerkleHasher<
      OutputDescription,
      OutputDescriptionHash,
      SerializedOutputDescription,
      SerializedOutputDescriptionHash
    >
{
  _outputDescriptionSerde: OutputDescriptionSerde
  _outputDescriptionHashSerde: OutputDescriptionHashSerde

  constructor() {
    this._outputDescriptionSerde = new OutputDescriptionSerde()
    this._outputDescriptionHashSerde = new OutputDescriptionHashSerde()
  }

  elementSerde(): Serde<OutputDescription, SerializedOutputDescription> {
    return this._outputDescriptionSerde
  }

  hashSerde(): Serde<OutputDescriptionHash, SerializedOutputDescriptionHash> {
    return this._outputDescriptionHashSerde
  }

  merkleHash(outputDescription: OutputDescription): Buffer {
    return outputDescription.merkleHash()
  }

  combineHash(
    depth: number,
    left: OutputDescriptionHash,
    right: OutputDescriptionHash,
  ): OutputDescriptionHash {
    return Buffer.from(NativeOutputDescription.combineHash(depth, left, right))
  }
}

/**
 * Demo merkle hasher implementation that combines hashes via concatenation.
 *
 * Useful for unit testing or displaying demo trees.
 */
export class ConcatHasher implements MerkleHasher<string, string, string, string> {
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

/**
 * Demo merkle hasher implementation that indicates a range of hashes.
 *
 * Useful for unit testing or displaying demo trees. Assumes the hashes are
 * in ascending order. Takes the left and right side of a hyphen in each hash
 * and combines them.
 */
export class RangeHasher implements MerkleHasher<string, string, string, string> {
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

/**
 * Simple hasher that encodes the tree structure in its hashes so its easy
 * to test if said structure is correct.
 *
 * Only useful for various types of unit testing.
 */
export class StructureHasher implements MerkleHasher<string, string, string, string> {
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
