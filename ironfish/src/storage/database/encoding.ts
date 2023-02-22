/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { IJSON, IJsonSerializable } from '../../serde'
import { BigIntUtils } from '../../utils'
import { IDatabaseEncoding } from './types'

export class JsonEncoding<T extends IJsonSerializable> implements IDatabaseEncoding<T> {
  serialize = (value: T): Buffer => Buffer.from(IJSON.stringify(value), 'utf8')
  deserialize = (buffer: Buffer): T => IJSON.parse(buffer.toString('utf8')) as T
}

export class StringEncoding<TValues extends string = string>
  implements IDatabaseEncoding<TValues>
{
  serialize = (value: TValues): Buffer => Buffer.from(value, 'utf8')
  deserialize = (buffer: Buffer): TValues => buffer.toString('utf8') as TValues
}

export class U32Encoding implements IDatabaseEncoding<number> {
  serialize(value: number): Buffer {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32LE(value)
    return buffer
  }

  deserialize(buffer: Buffer): number {
    return buffer.readUInt32LE()
  }
}

export class U32EncodingBE implements IDatabaseEncoding<number> {
  serialize(value: number): Buffer {
    const buffer = Buffer.alloc(4)
    buffer.writeUInt32BE(value)
    return buffer
  }

  deserialize(buffer: Buffer): number {
    return buffer.readUInt32BE()
  }
}

export class NullEncoding implements IDatabaseEncoding<null> {
  static EMPTY_BUFFER = Buffer.alloc(0)

  serialize(): Buffer {
    return NullEncoding.EMPTY_BUFFER
  }

  deserialize(): null {
    return null
  }
}

export class BufferEncoding implements IDatabaseEncoding<Buffer> {
  serialize = (value: Buffer): Buffer => value
  deserialize = (buffer: Buffer): Buffer => buffer
}

export class PrefixSizeError extends Error {
  name = this.constructor.name
}

export class PrefixEncoding<TPrefix, TKey> implements IDatabaseEncoding<[TPrefix, TKey]> {
  readonly keyEncoding: IDatabaseEncoding<TKey>
  readonly prefixEncoding: IDatabaseEncoding<TPrefix>
  readonly prefixSize: number

  constructor(
    prefixEncoding: IDatabaseEncoding<TPrefix>,
    keyEncoding: IDatabaseEncoding<TKey>,
    prefixSize: number,
  ) {
    this.keyEncoding = keyEncoding
    this.prefixEncoding = prefixEncoding
    this.prefixSize = prefixSize
  }

  serialize = (value: [TPrefix, TKey]): Buffer => {
    const prefixEncoded = this.prefixEncoding.serialize(value[0])
    const keyEncoded = this.keyEncoding.serialize(value[1])

    if (prefixEncoded.byteLength !== this.prefixSize) {
      throw new PrefixSizeError(
        `key prefix expected to be ${this.prefixSize} byte(s) but was ${prefixEncoded.byteLength}`,
      )
    }

    return Buffer.concat([prefixEncoded, keyEncoded])
  }

  deserialize = (buffer: Buffer): [TPrefix, TKey] => {
    const prefix = buffer.slice(0, this.prefixSize)
    const key = buffer.slice(this.prefixSize)

    const prefixDecoded = this.prefixEncoding.deserialize(prefix)
    const keyDecoded = this.keyEncoding.deserialize(key)

    return [prefixDecoded, keyDecoded]
  }
}

export class NullableBufferEncoding implements IDatabaseEncoding<Buffer | null> {
  serialize = (value: Buffer | null): Buffer => {
    const size = value ? bufio.sizeVarBytes(value) : 0

    const buffer = bufio.write(size)
    if (value) {
      buffer.writeVarBytes(value)
    }

    return buffer.render()
  }

  deserialize(buffer: Buffer): Buffer | null {
    const reader = bufio.read(buffer, true)

    if (reader.left()) {
      return reader.readVarBytes()
    }

    return null
  }
}

export class StringHashEncoding implements IDatabaseEncoding<string> {
  serialize(value: string): Buffer {
    const buffer = bufio.write(32)
    buffer.writeHash(value)
    return buffer.render()
  }

  deserialize(buffer: Buffer): string {
    const reader = bufio.read(buffer, true)
    const hash = reader.readHash()
    return hash.toString('hex')
  }
}

export class NullableStringEncoding implements IDatabaseEncoding<string | null> {
  serialize(value: string | null): Buffer {
    const size = value ? bufio.sizeVarString(value, 'utf8') : 0

    const buffer = bufio.write(size)
    if (value) {
      buffer.writeVarString(value, 'utf8')
    }
    return buffer.render()
  }

  deserialize(buffer: Buffer): string | null {
    const reader = bufio.read(buffer, true)
    if (reader.left()) {
      return reader.readVarString('utf8')
    }
    return null
  }
}

export class ArrayEncoding<T extends IJsonSerializable[]> extends JsonEncoding<T> {}

export class BigIntLEEncoding implements IDatabaseEncoding<BigInt> {
  serialize(value: bigint): Buffer {
    return BigIntUtils.toBytesLE(value)
  }

  deserialize(buffer: Buffer): bigint {
    return BigIntUtils.fromBytesLE(buffer)
  }
}

export class BigU64BEEncoding implements IDatabaseEncoding<BigInt> {
  serialize(value: bigint): Buffer {
    const buffer = bufio.write(8)
    buffer.writeBigU64BE(value)
    return buffer.render()
  }

  deserialize(buffer: Buffer): bigint {
    const reader = bufio.read(buffer, true)
    return reader.readBigU64BE()
  }
}

export class U64Encoding implements IDatabaseEncoding<number> {
  serialize(value: number): Buffer {
    const buffer = bufio.write(8)
    buffer.writeBigU64BE(BigInt(value))
    return buffer.render()
  }

  deserialize(buffer: Buffer): number {
    const reader = bufio.read(buffer, true)
    return Number(reader.readBigU64BE())
  }
}

export class BufferToStringEncoding {
  static serialize(element: Buffer): string {
    return element.toString('hex')
  }

  static deserialize(data: string): Buffer {
    return Buffer.from(data, 'hex')
  }
}

export const BUFFER_ENCODING = new BufferEncoding()
export const U32_ENCODING = new U32Encoding()
export const U32_ENCODING_BE = new U32EncodingBE()
export const NULL_ENCODING = new NullEncoding()
export const U64_ENCODING = new U64Encoding()
