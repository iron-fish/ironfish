/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { IDatabaseEncoding, IDatabaseStore } from '../../../../storage'

const KEY_LENGTH = 32
const PUBLIC_ADDRESS_LENGTH = 43

export type AccountsStore = IDatabaseStore<{ key: string; value: AccountsValue }>

export interface AccountsValue {
  name: string
  spendingKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
}

export class AccountsValueEncoding implements IDatabaseEncoding<AccountsValue> {
  serialize(value: AccountsValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    bw.writeVarString(value.name, 'utf8')
    bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountsValue {
    const reader = bufio.read(buffer, true)
    const name = reader.readVarString('utf8')
    const spendingKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    return {
      name,
      spendingKey,
      incomingViewKey,
      outgoingViewKey,
      publicAddress,
    }
  }

  getSize(value: AccountsValue): number {
    let size = bufio.sizeVarString(value.name, 'utf8')
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += PUBLIC_ADDRESS_LENGTH

    return size
  }
}
