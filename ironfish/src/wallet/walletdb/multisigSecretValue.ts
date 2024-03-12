/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { multisig } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'

export interface MultisigSecretValue {
  name: string
  secret: Buffer
}

export class MultisigSecretValueEncoding implements IDatabaseEncoding<MultisigSecretValue> {
  serialize(value: MultisigSecretValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeVarString(value.name, 'utf-8')
    bw.writeBytes(value.secret)
    return bw.render()
  }

  deserialize(buffer: Buffer): MultisigSecretValue {
    const reader = bufio.read(buffer, true)
    const name = reader.readVarString('utf-8')
    const secret = reader.readBytes(multisig.SECRET_LEN)
    return { name, secret }
  }

  getSize(value: MultisigSecretValue): number {
    let size = 0
    size += bufio.sizeVarString(value.name, 'utf8')
    size += multisig.SECRET_LEN
    return size
  }
}
