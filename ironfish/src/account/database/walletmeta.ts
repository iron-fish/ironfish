/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage/database/types'

export interface WalletDBMetaValue {
  defaultAccountId: number
}

export class WalletDBMetaValueEncoding implements IDatabaseEncoding<WalletDBMetaValue> {
  serialize(value: WalletDBMetaValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeU8(value.defaultAccountId)

    return bw.render()
  }

  deserialize(buffer: Buffer): WalletDBMetaValue {
    const reader = bufio.read(buffer, true)
    const defaultAccountId = reader.readU8()

    return {
      defaultAccountId,
    }
  }

  getSize(value: WalletDBMetaValue): number {
    const size = 1 // defaultAccountId

    return size
  }
}
