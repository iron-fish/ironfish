/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PUBLIC_ADDRESS_LENGTH } from '@ironfish/rust-nodejs'
import bufio, { EncodingError } from 'bufio'
import { Bech32m } from '../../../utils'
import { AccountImport, KEY_LENGTH, VIEW_KEY_LENGTH } from '../../walletdb/accountValue'
import { ACCOUNT_SCHEMA_VERSION } from '../account'
import { AccountDecodingOptions, AccountEncoder, DecodeFailed, DecodeInvalid } from './encoder'
import { NullableMultiSigKeysEncoding } from './multiSigKeys'

export const BECH32_ACCOUNT_PREFIX = 'ifaccount'

type Bech32Decoder = (
  reader: bufio.BufferReader,
  options?: AccountDecodingOptions,
) => AccountImport

export class Bech32Encoder implements AccountEncoder {
  VERSION = 2

  VERSION_DECODERS: Map<number, Bech32Decoder> = new Map([
    [1, decoderV1],
    [2, decoderV2],
  ])

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

    bw.writeU8(Number(!!value.multiSigKeys))
    if (value.multiSigKeys) {
      const encoding = new NullableMultiSigKeysEncoding()
      bw.writeU64(encoding.getSize(value.multiSigKeys))
      bw.writeBytes(encoding.serialize(value.multiSigKeys))
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

    try {
      const buffer = Buffer.from(hexEncoding, 'hex')

      const reader = bufio.read(buffer, true)

      const version = reader.readU16()

      const decoder = this.VERSION_DECODERS.get(version)

      if (decoder === undefined) {
        throw new DecodeInvalid(`Encoded account version ${version} not supported.`)
      }

      return decoder(reader, options)
    } catch (e) {
      if (e instanceof EncodingError) {
        throw new DecodeFailed(
          `Bufio decoding failed while using bech32 encoder: ${e.message}`,
          this.constructor.name,
        )
      }
      throw e
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
    size += 1 // multiSigKeys byte
    if (value.multiSigKeys) {
      const encoding = new NullableMultiSigKeysEncoding()
      size += 8 // size of multi sig keys
      size += encoding.getSize(value.multiSigKeys)
    }

    return size
  }
}

function decoderV1(
  reader: bufio.BufferReader,
  options?: AccountDecodingOptions,
): AccountImport {
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

function decoderV2(
  reader: bufio.BufferReader,
  options?: AccountDecodingOptions,
): AccountImport {
  const accountImport = decoderV1(reader, options)

  let multiSigKeys = undefined

  const hasMultiSigKeys = reader.readU8() === 1
  if (hasMultiSigKeys) {
    const size = reader.readU64()
    const encoder = new NullableMultiSigKeysEncoding()
    multiSigKeys = encoder.deserialize(reader.readBytes(size))
  }

  return {
    ...accountImport,
    multiSigKeys,
  }
}
