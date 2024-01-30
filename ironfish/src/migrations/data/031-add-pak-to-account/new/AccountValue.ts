/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../../storage'
import { HeadValue, NullableHeadValueEncoding } from './HeadValue'

const KEY_LENGTH = 32
export const VIEW_KEY_LENGTH = 64
const VERSION_LENGTH = 2

export interface AccountValue {
  version: number
  id: string
  name: string
  spendingKey: string | null
  proofAuthorizationKey: string | null
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  createdAt: HeadValue | null
  multiSigKeys?: {
    identifier: string
    keyPackage: string
    proofGenerationKey: string
  }
}

export class AccountValueEncoding implements IDatabaseEncoding<AccountValue> {
  serialize(value: AccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    let flags = 0
    flags |= Number(!!value.spendingKey) << 0
    flags |= Number(!!value.createdAt) << 1
    flags |= Number(!!value.multiSigKeys) << 2
    flags |= Number(!!value.proofAuthorizationKey) << 3
    bw.writeU8(flags)
    bw.writeU16(value.version)
    bw.writeVarString(value.id, 'utf8')
    bw.writeVarString(value.name, 'utf8')
    if (value.spendingKey) {
      bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    }
    if (value.proofAuthorizationKey) {
      bw.writeBytes(Buffer.from(value.proofAuthorizationKey, 'hex'))
    }
    bw.writeBytes(Buffer.from(value.viewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    if (value.createdAt) {
      const encoding = new NullableHeadValueEncoding()
      bw.writeBytes(encoding.serialize(value.createdAt))
    }

    if (value.multiSigKeys) {
      bw.writeVarBytes(Buffer.from(value.multiSigKeys.identifier, 'hex'))
      bw.writeVarBytes(Buffer.from(value.multiSigKeys.keyPackage, 'hex'))
      bw.writeVarBytes(Buffer.from(value.multiSigKeys.proofGenerationKey, 'hex'))
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountValue {
    const reader = bufio.read(buffer, true)
    const flags = reader.readU8()
    const version = reader.readU16()
    const hasSpendingKey = flags & (1 << 0)
    const hasCreatedAt = flags & (1 << 1)
    const hasMultiSigKeys = flags & (1 << 2)
    const hasProofAuthorizationKey = flags & (1 << 3)
    const id = reader.readVarString('utf8')
    const name = reader.readVarString('utf8')
    const spendingKey = hasSpendingKey ? reader.readBytes(KEY_LENGTH).toString('hex') : null
    const proofAuthorizationKey = hasProofAuthorizationKey
      ? reader.readBytes(KEY_LENGTH).toString('hex')
      : null
    const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    let createdAt = null
    if (hasCreatedAt) {
      const encoding = new NullableHeadValueEncoding()
      createdAt = encoding.deserialize(reader.readBytes(encoding.nonNullSize))
    }

    let multiSigKeys = undefined
    if (hasMultiSigKeys) {
      multiSigKeys = {
        identifier: reader.readVarBytes().toString('hex'),
        keyPackage: reader.readVarBytes().toString('hex'),
        proofGenerationKey: reader.readVarBytes().toString('hex'),
      }
    }

    return {
      version,
      id,
      name,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
      proofAuthorizationKey,
      publicAddress,
      createdAt,
      multiSigKeys,
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
    if (value.proofAuthorizationKey) {
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
    if (value.multiSigKeys) {
      size += bufio.sizeVarString(value.multiSigKeys.identifier, 'hex')
      size += bufio.sizeVarString(value.multiSigKeys.keyPackage, 'hex')
      size += bufio.sizeVarString(value.multiSigKeys.proofGenerationKey, 'hex')
    }

    return size
  }
}
