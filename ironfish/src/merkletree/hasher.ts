/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { StringSerde } from '../serde'
import Serde, { JsonSerializable } from '../serde'
import {
  IronfishNoteEncrypted,
  SerializedWasmNoteEncrypted,
  SerializedWasmNoteEncryptedHash,
  WasmNoteEncryptedHash,
  WasmNoteEncryptedHashSerde,
  WasmNoteEncryptedSerde,
} from '../primitives/noteEncrypted'
import { WasmNoteEncrypted } from 'ironfish-wasm-nodejs'

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
export class NoteHasher
  implements
    MerkleHasher<
      IronfishNoteEncrypted,
      WasmNoteEncryptedHash,
      SerializedWasmNoteEncrypted,
      SerializedWasmNoteEncryptedHash
    > {
  _merkleNoteSerde: WasmNoteEncryptedSerde
  _merkleNoteHashSerde: WasmNoteEncryptedHashSerde

  constructor() {
    this._merkleNoteSerde = new WasmNoteEncryptedSerde()
    this._merkleNoteHashSerde = new WasmNoteEncryptedHashSerde()
  }

  elementSerde(): Serde<IronfishNoteEncrypted, SerializedWasmNoteEncrypted> {
    return this._merkleNoteSerde
  }

  hashSerde(): Serde<WasmNoteEncryptedHash, SerializedWasmNoteEncryptedHash> {
    return this._merkleNoteHashSerde
  }

  merkleHash(note: IronfishNoteEncrypted): Buffer {
    return note.merkleHash()
  }

  combineHash(
    depth: number,
    left: WasmNoteEncryptedHash,
    right: WasmNoteEncryptedHash,
  ): WasmNoteEncryptedHash {
    return Buffer.from(WasmNoteEncrypted.combineHash(depth, left, right))
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
