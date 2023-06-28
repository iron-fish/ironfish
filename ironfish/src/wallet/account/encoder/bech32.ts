/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Bech32m } from '../../../utils'
import {
  AccountImport,
  KEY_LENGTH,
  VERSION_LENGTH,
  VIEW_KEY_LENGTH,
} from '../../walletdb/accountValue'
import { AccountEncoder } from './encoder'

export const BECH32_ACCOUNT_PREFIX = 'ironfishaccount00000'

export class Bech32AccountEncoder implements AccountEncoder {
  encode(value: AccountImport): string {
    const bw = bufio.write(this.getSize(value))
    bw.writeU16(value.version)

    let flags = 0
    flags |= Number(!!value.spendingKey) << 0
    flags |= Number(!!value.createdAt) << 1
    bw.writeU8(flags)

    bw.writeVarString(value.name, 'utf8')
    if (value.spendingKey) {
      bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    }
    bw.writeBytes(Buffer.from(value.viewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    if (value.createdAt) {
      bw.writeBytes(Buffer.from(value.createdAt.hash, 'hex'))
      bw.writeU32(value.createdAt.sequence)
    }

    return Bech32m.encode(bw.render().toString('hex'), BECH32_ACCOUNT_PREFIX)
  }

  decode(value: string): AccountImport | null {
    const [hexEncoding, _] = Bech32m.decode(value)

    if (hexEncoding === null) {
      return null
    }

    try {
      const buffer = Buffer.from(hexEncoding, 'hex')

      const reader = bufio.read(buffer, true)

      const version = reader.readU16()

      const flags = reader.readU8()
      const hasSpendingKey = flags & (1 << 0)
      const hasCreatedAt = flags & (1 << 1)

      const name = reader.readVarString('utf8')
      const spendingKey = hasSpendingKey ? reader.readBytes(KEY_LENGTH).toString('hex') : null
      const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
      const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
      const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
      const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

      let createdAt = null
      if (hasCreatedAt) {
        const hash = reader.readBytes(32).toString('hex')
        const sequence = reader.readU32()
        createdAt = { hash, sequence }
      }

      return {
        version,
        name,
        viewKey,
        incomingViewKey,
        outgoingViewKey,
        spendingKey,
        publicAddress,
        createdAt,
      }
    } catch (e: unknown) {
      if (e instanceof bufio.EncodingError) {
        return null
      }

      throw e
    }
  }

  getSize(value: AccountImport): number {
    let size = 0
    size += VERSION_LENGTH
    size += 1 // flags
    size += bufio.sizeVarString(value.name, 'utf8')
    if (value.spendingKey) {
      size += KEY_LENGTH
    }
    size += VIEW_KEY_LENGTH
    size += KEY_LENGTH // incomingViewKey
    size += KEY_LENGTH // outgoingViewKey
    size += PUBLIC_ADDRESS_LENGTH
    if (value.createdAt) {
      size += 32 // block hash
      size += 4 // block sequence
    }

    return size
  }
}
