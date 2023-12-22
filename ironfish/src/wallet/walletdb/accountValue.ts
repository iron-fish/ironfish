/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../storage'
import { ACCOUNT_KEY_LENGTH } from '../account/account'
import { HeadValue, NullableHeadValueEncoding } from './headValue'

export const KEY_LENGTH = ACCOUNT_KEY_LENGTH
export const VIEW_KEY_LENGTH = 64
const VERSION_LENGTH = 2

export interface AccountValue {
  version: number
  id: string
  name: string
  spendingKey: string | null
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  createdAt: HeadValue | null
  keyPackage?: string
  multiSigIdentifier?: string
}

export type AccountImport = Omit<AccountValue, 'id'>

export class AccountValueEncoding implements IDatabaseEncoding<AccountValue> {
  serialize(value: AccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    let flags = 0
    flags |= Number(!!value.spendingKey) << 0
    flags |= Number(!!value.createdAt) << 1
    flags |= Number(!!value.keyPackage) << 2
    flags |= Number(!!value.multiSigIdentifier) << 3
    bw.writeU8(flags)
    bw.writeU16(value.version)
    bw.writeVarString(value.id, 'utf8')
    bw.writeVarString(value.name, 'utf8')
    if (value.spendingKey) {
      bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    }
    bw.writeBytes(Buffer.from(value.viewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    if (value.createdAt) {
      const encoding = new NullableHeadValueEncoding()
      bw.writeBytes(encoding.serialize(value.createdAt))
    }

    if (value.keyPackage) {
      bw.writeVarString(value.keyPackage, 'hex')
    }

    if (value.multiSigIdentifier) {
      bw.writeVarString(value.multiSigIdentifier, 'hex')
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountValue {
    const reader = bufio.read(buffer, true)
    const flags = reader.readU8()
    const version = reader.readU16()
    const hasSpendingKey = flags & (1 << 0)
    const hasCreatedAt = flags & (1 << 1)
    const hasKeyPackage = flags & (1 << 2)
    const hasMultiSigIdentifier = flags & (1 << 3)
    const id = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const spendingKey = hasSpendingKey ? reader.readBytes(KEY_LENGTH).toString('hex') : null
    const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    let createdAt = null
    if (hasCreatedAt) {
      const encoding = new NullableHeadValueEncoding()
      createdAt = encoding.deserialize(reader.readBytes(encoding.nonNullSize))
    }

    let keyPackage = undefined
    if (hasKeyPackage) {
      keyPackage = reader.readVarString('hex')
    }

    let multiSigIdentifier = undefined
    if (hasMultiSigIdentifier) {
      multiSigIdentifier = reader.readVarString('hex')
    }

    return {
      version,
      id,
      name,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
      publicAddress,
      createdAt,
      keyPackage,
      multiSigIdentifier
    }
  }

  getSize(value: AccountValue): number {
    let size = 0
    size += 1 // flags
    size += VERSION_LENGTH
    size += bufio.sizeVarString(value.id, 'utf8')
    size += bufio.sizeVarString(value.name, 'utf8')
    if (value.spendingKey) {
      size += KEY_LENGTH
    }
    size += VIEW_KEY_LENGTH
    size += KEY_LENGTH
    size += KEY_LENGTH
    size += PUBLIC_ADDRESS_LENGTH
    if (value.createdAt) {
      const encoding = new NullableHeadValueEncoding()
      size += encoding.nonNullSize
    }
    if (value.keyPackage) {
      size += bufio.sizeVarString(value.keyPackage, 'hex')
    }
    if (value.multiSigIdentifier) {
      size += bufio.sizeVarString(value.multiSigIdentifier, 'hex')
    }

    return size
  }
}
