/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'
import { NoteHasher, Witness } from '../merkletree'
import { Side } from '../merkletree/merkletree'
import { WitnessNode } from '../merkletree/witness'
import { Note } from '../primitives'
import { NoteEncrypted } from '../primitives/noteEncrypted'

export function makeFakeWitness(note: Note): Witness<NoteEncrypted, Buffer, Buffer, Buffer> {
  const hasher = new NoteHasher()

  let rootHash = note.hash()

  const witnessPath: WitnessNode<Buffer>[] = []
  for (let i = 0; i < 32; i++) {
    const hashOfSibling = Buffer.alloc(32, i)
    if (Math.floor(Math.random() * 2)) {
      witnessPath.push({ side: Side.Right, hashOfSibling })
      rootHash = hasher.combineHash(i, hashOfSibling, rootHash)
    } else {
      witnessPath.push({ side: Side.Left, hashOfSibling })
      rootHash = hasher.combineHash(i, rootHash, hashOfSibling)
    }
  }

  const witness = new Witness(0, rootHash, witnessPath, hasher)

  Assert.isTrue(witness.verify(note.hash()))

  return witness
}
