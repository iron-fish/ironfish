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

export class MasterKeyValueEncoding implements IDatabaseEncoding<MasterKeyValue> {
  serialize(value: MasterKeyValue): Buffer {
    const bw = bufio.write(this.getSize())
    bw.writeBytes(value.nonce)
    bw.writeBytes(value.salt)
    return bw.render()
  }

  deserialize(buffer: Buffer): MasterKeyValue {
    const reader = bufio.read(buffer, true)

    const nonce = reader.readBytes(xchacha20poly1305.XNONCE_LENGTH)
    const salt = reader.readBytes(xchacha20poly1305.XSALT_LENGTH)
    return { nonce, salt }
  }

  getSize(): number {
    return xchacha20poly1305.XNONCE_LENGTH + xchacha20poly1305.XSALT_LENGTH
  }
}
