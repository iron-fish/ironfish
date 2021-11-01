/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  NoteEncrypted,
  NoteEncryptedHash,
  SerializedNoteEncrypted,
  SerializedNoteEncryptedHash,
} from '../primitives/noteEncrypted'
import { JsonSerializable } from '../serde'
import { MerkleHasher } from './hasher'
import { Side } from './merkletree'

export interface WitnessNode<H> {
  side: Side
  hashOfSibling: H
}

export class SerializedWitnessNode<SH> {
  constructor(readonly _side: Side, readonly _hashOfSibling: SH) {}

  side: () => Side = () => this._side
  hashOfSibling: () => SH = () => this._hashOfSibling
}

/**
 * Commitment that a leaf node exists in the tree with an authentication path
 * and the rootHash of the tree at the time the authentication path was calculated.
 */
export class Witness<E, H, SE extends JsonSerializable, SH extends JsonSerializable> {
  constructor(
    readonly _treeSize: number,
    readonly rootHash: H,
    readonly authenticationPath: WitnessNode<H>[],
    readonly merkleHasher: MerkleHasher<E, H, SE, SH>,
  ) {}

  verify(myHash: H): boolean {
    let currentHash = myHash
    for (let i = 0; i < this.authenticationPath.length; i++) {
      const node = this.authenticationPath[i]
      if (node.side === Side.Left) {
        currentHash = this.merkleHasher.combineHash(i, currentHash, node.hashOfSibling)
      } else {
        currentHash = this.merkleHasher.combineHash(i, node.hashOfSibling, currentHash)
      }
    }
    return this.merkleHasher.hashSerde().equals(currentHash, this.rootHash)
  }

  authPath(): SerializedWitnessNode<SH>[] {
    return this.authenticationPath.map(
      (n) =>
        new SerializedWitnessNode(
          n.side,
          this.merkleHasher.hashSerde().serialize(n.hashOfSibling),
        ),
    )
  }

  treeSize(): number {
    return this._treeSize
  }

  serializeRootHash(): SH {
    return this.merkleHasher.hashSerde().serialize(this.rootHash)
  }
}

export type NoteWitness = Witness<
  NoteEncrypted,
  NoteEncryptedHash,
  SerializedNoteEncrypted,
  SerializedNoteEncryptedHash
>
