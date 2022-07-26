/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Blake3Hasher } from '@napi-rs/blake-hash'
import { MerkleHasher } from '../merkletree'
import { BufferSerde, NullifierSerdeInstance } from '../serde'

export type Nullifier = Buffer
export type NullifierHash = Buffer

const NULLIFIER_KEY = Buffer.alloc(32, 'IRONFISH BLAKE3 NULLIFIER PRSNAL')
const COMBINE_KEY = Buffer.alloc(32, 'IRONFISH NULLIFIER COMBINE HASHS')

export class NullifierHasher implements MerkleHasher<Nullifier, NullifierHash, string, string> {
  elementSerde(): BufferSerde {
    return NullifierSerdeInstance
  }

  hashSerde(): BufferSerde {
    return NullifierSerdeInstance
  }

  merkleHash(element: Nullifier): NullifierHash {
    const hasher = Blake3Hasher.newKeyed(NULLIFIER_KEY)
    hasher.update(element)
    return hasher.digestBuffer()
  }

  combineHash(depth: number, left: NullifierHash, right: NullifierHash): NullifierHash {
    const hasher = Blake3Hasher.newKeyed(COMBINE_KEY)
    hasher.update(Buffer.from([depth]))
    hasher.update(left)
    hasher.update(right)
    return hasher.digestBuffer()
  }
}
