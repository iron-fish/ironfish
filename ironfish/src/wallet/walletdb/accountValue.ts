/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'
import { ACCOUNT_KEY_LENGTH } from '../account'

const KEY_LENGTH = ACCOUNT_KEY_LENGTH

export interface AccountValue {
  id: string
  name: string
  spendingKey: string | null
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
}

export class AccountValueEncoding implements IDatabaseEncoding<AccountValue> {
  nullValue = '0'.repeat(64)
  serialize(value: AccountValue): Buffer {
    const { id, name, spendingKey, incomingViewKey, outgoingViewKey, publicAddress } = value
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!spendingKey) << 0
    bw.writeU8(flags)
    bw.writeVarString(id, 'utf8')
    bw.writeVarString(name, 'utf8')
    if (spendingKey) {
      bw.writeBytes(Buffer.from(spendingKey, 'hex'))
    }
    bw.writeBytes(Buffer.from(incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(publicAddress, 'hex'))

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountValue {
    const reader = bufio.read(buffer, true)
    const flags = reader.readU8()
    const hasSpendingKey = flags & (1 << 0)
    const id = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const spendingKey = hasSpendingKey ? reader.readBytes(KEY_LENGTH).toString('hex') : null
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    return {
      id,
      name,
      publicAddress,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
    }
  }

  getSize(value: AccountValue): number {
    let size = 0
    size += 1
    size += bufio.sizeVarString(value.id, 'utf8')
    size += bufio.sizeVarString(value.name, 'utf8')
    if (value.spendingKey) {
      size += KEY_LENGTH
    }
    size += KEY_LENGTH // outgoing
    size += KEY_LENGTH // incoming
    size += PUBLIC_ADDRESS_LENGTH

    return size
  }
}
