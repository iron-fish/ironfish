/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { KEY_LENGTH, PUBLIC_ADDRESS_LENGTH, xchacha20poly1305 } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { IDatabaseEncoding } from '../../../../storage'
import { HeadValue, NullableHeadValueEncoding } from './headValue'
import { MultisigKeys } from './interfaces/multisigKeys'
import { MultisigKeysEncoding } from './multisigKeys'

export const VIEW_KEY_LENGTH = 64
const VERSION_LENGTH = 2

export type EncryptedAccountValue = {
  encrypted: true
  salt: Buffer
  nonce: Buffer
  data: Buffer
}

export type DecryptedAccountValue = {
  encrypted: false
  version: number
  id: string
  name: string
  spendingKey: string | null
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  createdAt: HeadValue | null
  scanningEnabled: boolean
  multisigKeys?: MultisigKeys
  proofAuthorizingKey: string | null
}

export type AccountValue = EncryptedAccountValue | DecryptedAccountValue
export class AccountValueEncoding implements IDatabaseEncoding<AccountValue> {
  serialize(value: AccountValue): Buffer {
    if (value.encrypted) {
      return this.serializeEncrypted(value)
    } else {
      return this.serializeDecrypted(value)
    }
  }

  serializeEncrypted(value: EncryptedAccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!value.encrypted) << 5
    bw.writeU8(flags)
    bw.writeBytes(value.salt)
    bw.writeBytes(value.nonce)
    bw.writeVarBytes(value.data)

    return bw.render()
  }

  serializeDecrypted(value: DecryptedAccountValue): Buffer {
    const bw = bufio.write(this.getSize(value))
    let flags = 0
    flags |= Number(!!value.spendingKey) << 0
    flags |= Number(!!value.createdAt) << 1
    flags |= Number(!!value.multisigKeys) << 2
    flags |= Number(!!value.proofAuthorizingKey) << 3
    flags |= Number(!!value.scanningEnabled) << 4
    flags |= Number(!!value.encrypted) << 5

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

    if (value.multisigKeys) {
      const encoding = new MultisigKeysEncoding()
      bw.writeU64(encoding.getSize(value.multisigKeys))
      bw.writeBytes(encoding.serialize(value.multisigKeys))
    }

    if (value.proofAuthorizingKey) {
      bw.writeBytes(Buffer.from(value.proofAuthorizingKey, 'hex'))
    }

    return bw.render()
  }

  deserialize(buffer: Buffer): AccountValue {
    const reader = bufio.read(buffer, true)
    const flags = reader.readU8()
    const encrypted = Boolean(flags & (1 << 5))

    if (encrypted) {
      return this.deserializeEncrypted(buffer)
    } else {
      return this.deserializeDecrypted(buffer)
    }
  }

  deserializeEncrypted(buffer: Buffer): EncryptedAccountValue {
    const reader = bufio.read(buffer, true)

    // Skip flags
    reader.readU8()

    const salt = reader.readBytes(xchacha20poly1305.XSALT_LENGTH)
    const nonce = reader.readBytes(xchacha20poly1305.XNONCE_LENGTH)
    const data = reader.readVarBytes()
    return {
      encrypted: true,
      nonce,
      salt,
      data,
    }
  }

  deserializeDecrypted(buffer: Buffer): DecryptedAccountValue {
    const reader = bufio.read(buffer, true)
    const flags = reader.readU8()
    const version = reader.readU16()
    const hasSpendingKey = flags & (1 << 0)
    const hasCreatedAt = flags & (1 << 1)
    const hasMultisigKeys = flags & (1 << 2)
    const hasProofAuthorizingKey = flags & (1 << 3)
    const scanningEnabled = Boolean(flags & (1 << 4))
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

    let multisigKeys = undefined
    if (hasMultisigKeys) {
      const multisigKeysLength = reader.readU64()
      const encoding = new MultisigKeysEncoding()
      multisigKeys = encoding.deserialize(reader.readBytes(multisigKeysLength))
    }

    const proofAuthorizingKey = hasProofAuthorizingKey
      ? reader.readBytes(KEY_LENGTH).toString('hex')
      : null

    return {
      encrypted: false,
      version,
      id,
      name,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
      publicAddress,
      createdAt,
      scanningEnabled,
      multisigKeys,
      proofAuthorizingKey,
    }
  }

  getSize(value: AccountValue): number {
    if (value.encrypted) {
      return this.getSizeEncrypted(value)
    } else {
      return this.getSizeDecrypted(value)
    }
  }

  getSizeEncrypted(value: EncryptedAccountValue): number {
    let size = 0
    size += 1 // flags
    size += xchacha20poly1305.XSALT_LENGTH
    size += xchacha20poly1305.XNONCE_LENGTH
    size += bufio.sizeVarBytes(value.data)
    return size
  }

  getSizeDecrypted(value: DecryptedAccountValue): number {
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

    if (value.multisigKeys) {
      const encoding = new MultisigKeysEncoding()
      size += 8 // size of multi sig keys
      size += encoding.getSize(value.multisigKeys)
    }
    if (value.proofAuthorizingKey) {
      size += KEY_LENGTH
    }

    return size
  }
}
