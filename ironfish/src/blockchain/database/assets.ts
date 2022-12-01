/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { IDatabaseEncoding } from '../../storage/database/types'
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BigIntUtils } from '../../utils'

export interface AssetsValue {
  createdTransactionHash: Buffer
  metadata: string
  name: string
  nonce: number
  owner: string
  supply: bigint
}

export class AssetsValueEncoding implements IDatabaseEncoding<AssetsValue> {
  serialize(value: AssetsValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeHash(value.createdTransactionHash)
    bw.writeVarString(value.metadata, 'utf8')
    bw.writeVarString(value.name, 'utf8')
    bw.writeU8(value.nonce)
    bw.writeBytes(Buffer.from(value.owner, 'hex'))
    bw.writeVarBytes(BigIntUtils.toBytesLE(value.supply))
    return bw.render()
  }

  deserialize(buffer: Buffer): AssetsValue {
    const reader = bufio.read(buffer, true)
    const createdTransactionHash = reader.readHash()
    const metadata = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const nonce = reader.readU8()
    const owner = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')
    const supply = BigIntUtils.fromBytesLE(reader.readVarBytes())
    return { createdTransactionHash, metadata, name, nonce, owner, supply }
  }

  getSize(value: AssetsValue): number {
    let size = 0
    size += 32 // createdTransactionHash
    size += bufio.sizeVarString(value.metadata, 'utf8') // metadata
    size += bufio.sizeVarString(value.name, 'utf8') // name
    size += 1 // nonce
    size += PUBLIC_ADDRESS_LENGTH // owner
    size += bufio.sizeVarBytes(BigIntUtils.toBytesLE(value.supply)) // supply
    return size
  }
}
