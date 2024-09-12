/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'
import { NONCE_LENGTH } from '@ironfish/rust-nodejs'

export type MasterKeyValue = {
  nonce: Buffer
  salt: Buffer
}

export class NullableMasterKeyValueEncoding implements IDatabaseEncoding<MasterKeyValue | null> {
  serialize(value: MasterKeyValue | null): Buffer {
    const bw = bufio.write(this.getSize(value))

    if (value) {
      bw.writeBytes(value.nonce)
      bw.writeVarBytes(value.salt)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): MasterKeyValue | null {
    const reader = bufio.read(buffer, true)

    if (reader.left()) {
      const nonce = reader.readBytes(NONCE_LENGTH)
      const salt = reader.readVarBytes()
      return { nonce, salt}
    }

    return null
  }

  getSize(value: MasterKeyValue | null): number {
    if (!value) {
      return 0
    }

    return NONCE_LENGTH + bufio.sizeVarBytes(value.salt)
  }
}
