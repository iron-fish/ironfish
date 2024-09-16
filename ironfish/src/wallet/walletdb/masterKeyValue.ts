/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { xchacha20poly1305 } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export type MasterKeyValue = {
  nonce: Buffer
  salt: Buffer
}

export class NullableMasterKeyValueEncoding
  implements IDatabaseEncoding<MasterKeyValue | null>
{
  serialize(value: MasterKeyValue | null): Buffer {
    const bw = bufio.write(this.getSize(value))

    if (value) {
      bw.writeBytes(value.nonce)
      bw.writeBytes(value.salt)
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): MasterKeyValue | null {
    const reader = bufio.read(buffer, true)

    if (reader.left()) {
      const nonce = reader.readBytes(xchacha20poly1305.XNONCE_LENGTH)
      const salt = reader.readBytes(xchacha20poly1305.XSALT_LENGTH)
      return { nonce, salt }
    }

    return null
  }

  getSize(value: MasterKeyValue | null): number {
    if (!value) {
      return 0
    }

    return xchacha20poly1305.XNONCE_LENGTH + xchacha20poly1305.XSALT_LENGTH
  }
}
