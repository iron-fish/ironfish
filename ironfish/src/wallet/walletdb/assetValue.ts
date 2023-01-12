/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { IDatabaseEncoding } from '../../storage/database/types'
import {
  ASSET_ID_LENGTH,
  ASSET_METADATA_LENGTH,
  ASSET_NAME_LENGTH,
  ASSET_OWNER_LENGTH,
  PUBLIC_ADDRESS_LENGTH,
} from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { BigIntUtils } from '../../utils'

export interface AssetValue {
  createdTransactionHash: Buffer
  id: Buffer
  metadata: Buffer
  name: Buffer
  owner: Buffer
  supply: bigint
}

export class AssetValueEncoding implements IDatabaseEncoding<AssetValue> {
  serialize(value: AssetValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeHash(value.createdTransactionHash)
    bw.writeHash(value.id)
    bw.writeBytes(value.metadata)
    bw.writeBytes(value.name)
    bw.writeBytes(value.owner)
    bw.writeVarBytes(BigIntUtils.toBytesLE(value.supply))
    return bw.render()
  }

  deserialize(buffer: Buffer): AssetValue {
    const reader = bufio.read(buffer, true)
    const createdTransactionHash = reader.readHash()
    const id = reader.readBytes(ASSET_ID_LENGTH)
    const metadata = reader.readBytes(ASSET_METADATA_LENGTH)
    const name = reader.readBytes(ASSET_NAME_LENGTH)
    const owner = reader.readBytes(ASSET_OWNER_LENGTH)
    const supply = BigIntUtils.fromBytesLE(reader.readVarBytes())
    return { createdTransactionHash, id, metadata, name, owner, supply }
  }

  getSize(value: AssetValue): number {
    let size = 0
    size += 32 // createdTransactionHash
    size += ASSET_ID_LENGTH // id
    size += ASSET_METADATA_LENGTH // metadata
    size += ASSET_NAME_LENGTH // name
    size += PUBLIC_ADDRESS_LENGTH // owner
    size += bufio.sizeVarBytes(BigIntUtils.toBytesLE(value.supply)) // supply
    return size
  }
}
