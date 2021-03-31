/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MerkleHasher } from './merkleTree'
import { BufferSerde } from '../../serde'

import { createKeyed } from 'blake3-wasm'

export type Nullifier = Buffer
export type NullifierHash = Buffer

const NULLIFIER_KEY = Buffer.alloc(32, 'IRONFISH BLAKE3 NULLIFIER PRSNAL')
const COMBINE_KEY = Buffer.alloc(32, 'IRONFISH NULLIFIER COMBINE HASHS')

export class NullifierHasher implements MerkleHasher<Nullifier, NullifierHash, string, string> {
  _elementSerde: BufferSerde
  _hashSerde: BufferSerde

  constructor() {
    this._elementSerde = new BufferSerde(32)
    this._hashSerde = new BufferSerde(32)
  }
  elementSerde(): BufferSerde {
    return this._elementSerde
  }

  hashSerde(): BufferSerde {
    return this._hashSerde
  }

  merkleHash(element: Nullifier): NullifierHash {
    const hasher = createKeyed(NULLIFIER_KEY)
    hasher.update(element)
    return hasher.digest()
  }

  combineHash(depth: number, left: NullifierHash, right: NullifierHash): NullifierHash {
    const hasher = createKeyed(COMBINE_KEY)
    hasher.update([depth])
    hasher.update(left)
    hasher.update(right)
    return hasher.digest()
  }
}
