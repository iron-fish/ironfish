/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio from 'bufio'
import { Bech32m } from '../../../utils'
import { AccountExport, KEY_LENGTH, VIEW_KEY_LENGTH } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { AccountDecodingOptions, AccountEncoder } from './encoder'

export const BECH32_ACCOUNT_PREFIX = 'ifaccount'
export class Bech32Encoder implements AccountEncoder {
  VERSION = 1

  encode(value: AccountExport): string {
    const bw = bufio.write(this.getSize(value))
    bw.writeU16(this.VERSION)

    bw.writeVarString(value.name, 'utf8')
    bw.writeBytes(Buffer.from(value.viewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.incomingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.outgoingViewKey, 'hex'))
    bw.writeBytes(Buffer.from(value.publicAddress, 'hex'))

    bw.writeU8(Number(!!value.spendingKey))
    if (value.spendingKey) {
      bw.writeBytes(Buffer.from(value.spendingKey, 'hex'))
    }

    bw.writeU8(Number(!!value.createdAt))
    if (value.createdAt) {
      bw.writeBytes(value.createdAt.hash)
      bw.writeU32(value.createdAt.sequence)
    }

    return Bech32m.encode(bw.render().toString('hex'), BECH32_ACCOUNT_PREFIX)
  }

  decode(value: string, options?: AccountDecodingOptions): AccountExport {
    const [hexEncoding, _] = Bech32m.decode(value)

    if (hexEncoding === null) {
      throw new Error(`Could not decode account ${value} using bech32`)
    }

    const buffer = Buffer.from(hexEncoding, 'hex')

    const reader = bufio.read(buffer, true)

    const version = reader.readU16()

    if (version !== this.VERSION) {
      throw new Error(
        `Encoded account version ${version} does not match encoder version ${this.VERSION}`,
      )
    }

    const name = reader.readVarString('utf8')
    const viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
    const incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
    const publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

    const hasSpendingKey = reader.readU8() === 1
    const spendingKey = hasSpendingKey ? reader.readBytes(KEY_LENGTH).toString('hex') : null

    const hasCreatedAt = reader.readU8() === 1
    let createdAt = null
    if (hasCreatedAt) {
      const hash = reader.readBytes(32)
      const sequence = reader.readU32()
      createdAt = { hash, sequence }
    }

    return {
      version: ACCOUNT_SCHEMA_VERSION,
      name: options?.name ? options.name : name,
      viewKey,
      incomingViewKey,
      outgoingViewKey,
      spendingKey,
      publicAddress,
      createdAt,
    }
  }

  getSize(value: AccountExport): number {
    let size = 0
    size += 2 // encoder version
    size += bufio.sizeVarString(value.name, 'utf8')
    size += VIEW_KEY_LENGTH
    size += KEY_LENGTH // incomingViewKey
    size += KEY_LENGTH // outgoingViewKey
    size += PUBLIC_ADDRESS_LENGTH
    size += 1 // spendingKey byte
    if (value.spendingKey) {
      size += KEY_LENGTH
    }
    size += 1 // createdAt byte
    if (value.createdAt) {
      size += 32 // block hash
      size += 4 // block sequence
    }

    return size
  }
}
