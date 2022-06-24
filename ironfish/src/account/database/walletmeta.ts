/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage/database/types'

const KEY_LENGTH = 32

export interface WalletDBMetaValue {
  defaultAccountId: number
  headHashes: Map<number, string>
}

export class WalletDBMetaValueEncoding implements IDatabaseEncoding<WalletDBMetaValue> {
  serialize(value: WalletDBMetaValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeU8(value.defaultAccountId)

    bw.writeU8(value.headHashes.size)

    for (const [accountId, headHash] of value.headHashes.entries()) {
      bw.writeU8(accountId)
      bw.writeBytes(Buffer.from(headHash, 'hex'))
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): WalletDBMetaValue {
    const reader = bufio.read(buffer, true)
    const defaultAccountId = reader.readU8()

    const headHashCount = reader.readU8()
    const headHashes = new Map()

    for (let i = 0; i < headHashCount; i += 1) {
      const accountId = reader.readU8()
      const headHash = reader.readBytes(KEY_LENGTH).toString('hex')
      headHashes.set(accountId, headHash)
    }

    return {
      defaultAccountId,
      headHashes,
    }
  }

  getSize(value: WalletDBMetaValue): number {
    const size =
      1 + // defaultAccountId
      1 + // headHashes size
      (1 + KEY_LENGTH) * value.headHashes.size

    return size
  }
}
