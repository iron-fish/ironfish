/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio, { EncodingError } from 'bufio'
import { Bech32m } from '../../../utils'
import { AccountImport, KEY_LENGTH, VIEW_KEY_LENGTH } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed, DecodeInvalid } from './encoder'

export const BECH32_ACCOUNT_PREFIX = 'ifaccount'
export class Bech32Encoder implements AccountEncoder {
  VERSION = 1

  encode(value: AccountImport): string {
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

  decode(value: string, options?: AccountDecodingOptions): AccountImport {
    const [hexEncoding, err] = Bech32m.decode(value)

    if (!hexEncoding) {
      throw new DecodeFailed(
        `Could not decode account ${value} using bech32: ${err?.message || ''}`,
        this.constructor.name,
      )
    }

    let name: string
    let viewKey: string
    let incomingViewKey: string
    let outgoingViewKey: string
    let publicAddress: string
    let spendingKey: string | null
    let createdAt = null

    try {
      const buffer = Buffer.from(hexEncoding, 'hex')

      const reader = bufio.read(buffer, true)

      const version = reader.readU16()

      if (version !== this.VERSION) {
        throw new DecodeInvalid(
          `Encoded account version ${version} does not match encoder version ${this.VERSION}`,
        )
      }

      name = reader.readVarString('utf8')
      viewKey = reader.readBytes(VIEW_KEY_LENGTH).toString('hex')
      incomingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
      outgoingViewKey = reader.readBytes(KEY_LENGTH).toString('hex')
      publicAddress = reader.readBytes(PUBLIC_ADDRESS_LENGTH).toString('hex')

      const hasSpendingKey = reader.readU8() === 1
      spendingKey = hasSpendingKey ? reader.readBytes(KEY_LENGTH).toString('hex') : null

      const hasCreatedAt = reader.readU8() === 1

      if (hasCreatedAt) {
        const hash = reader.readBytes(32)
        const sequence = reader.readU32()
        createdAt = { hash, sequence }
      }
    } catch (e) {
      if (e instanceof EncodingError) {
        throw new DecodeFailed(
          `Bufio decoding failed while using bech32 encoder: ${e.message}`,
          this.constructor.name,
        )
      }
      throw e
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

  getSize(value: AccountImport): number {
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
