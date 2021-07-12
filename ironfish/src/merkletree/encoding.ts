/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IJSON, JsonSerializable } from '../serde'
import { IDatabaseEncoding } from '../storage'
import { MerkleHasher } from './hasher'
import { LeavesSchema, NodeValue } from './schema'

export class LeafEncoding<E, H, SE extends JsonSerializable, SH extends JsonSerializable>
  implements IDatabaseEncoding<LeavesSchema<E, H>['value']>
{
  hasher: MerkleHasher<E, H, SE, SH>

  constructor(hasher: MerkleHasher<E, H, SE, SH>) {
    this.hasher = hasher
  }

  serialize = (value: LeavesSchema<E, H>['value']): Buffer => {
    const intermediate = {
      ...value,
      element: this.hasher.elementSerde().serialize(value.element),
      merkleHash: this.hasher.hashSerde().serialize(value.merkleHash),
    }
    return Buffer.from(IJSON.stringify(intermediate), 'utf8')
  }

  deserialize = (buffer: Buffer): LeavesSchema<E, H>['value'] => {
    const intermediate = IJSON.parse(buffer.toString('utf8')) as Omit<
      LeavesSchema<E, H>['value'],
      'element' | 'merkleHash'
    > & { element: SE; merkleHash: SH }
    return {
      ...intermediate,
      element: this.hasher.elementSerde().deserialize(intermediate.element),
      merkleHash: this.hasher.hashSerde().deserialize(intermediate.merkleHash),
    }
  }

  equals(): boolean {
    throw new Error('You should never use this')
  }
}

export class NodeEncoding<E, H, SE extends JsonSerializable, SH extends JsonSerializable>
  implements IDatabaseEncoding<NodeValue<H>>
{
  hasher: MerkleHasher<E, H, SE, SH>

  constructor(hasher: MerkleHasher<E, H, SE, SH>) {
    this.hasher = hasher
  }

  serialize = (value: NodeValue<H>): Buffer => {
    const intermediate = {
      ...value,
      hashOfSibling: this.hasher.hashSerde().serialize(value.hashOfSibling),
    }
    return Buffer.from(IJSON.stringify(intermediate), 'utf8')
  }
  deserialize = (buffer: Buffer): NodeValue<H> => {
    const intermediate = IJSON.parse(buffer.toString('utf8')) as Omit<
      NodeValue<H>,
      'hashOfSibling'
    > & { hashOfSibling: SH }

    return {
      ...intermediate,
      hashOfSibling: this.hasher.hashSerde().deserialize(intermediate.hashOfSibling),
    }
  }

  equals(): boolean {
    throw new Error('You should never use this')
  }
}
