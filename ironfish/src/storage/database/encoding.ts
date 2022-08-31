/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import hexArray from 'hex-array'
import { IJSON, IJsonSerializable, Serde } from '../../serde'
import { BigIntUtils } from '../../utils'
import { DatabaseKeyRange, IDatabaseEncoding } from './types'
import { StorageUtils } from './utils'

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

export class BufferEncoding implements IDatabaseEncoding<Buffer> {
  serialize = (value: Buffer): Buffer => value
  deserialize = (buffer: Buffer): Buffer => buffer
}

export class PrefixSizeError extends Error {}

export class PrefixEncoding<TPrefix, TKey> implements IDatabaseEncoding<[TPrefix, TKey]> {
  readonly keyEncoding: IDatabaseEncoding<TKey>
  readonly prefixEncoding: IDatabaseEncoding<TPrefix>
  readonly prefixSize: number

  constructor(
    keyEncoding: IDatabaseEncoding<TKey>,
    prefixEncoding: IDatabaseEncoding<TPrefix>,
    prefixSize: number,
  ) {
    this.keyEncoding = keyEncoding
    this.prefixEncoding = prefixEncoding
    this.prefixSize = prefixSize
  }

  serialize = (value: [TPrefix, TKey]): Buffer => {
    const prefixEncoded = this.prefixEncoding.serialize(value[0])
    const keyEncoded = this.keyEncoding.serialize(value[1])

    this.assertPrefixSize(prefixEncoded)

    return Buffer.concat([prefixEncoded, keyEncoded])
  }

  deserialize = (buffer: Buffer): [TPrefix, TKey] => {
    const prefix = buffer.slice(0, this.prefixSize)
    const key = buffer.slice(this.prefixSize)

    const prefixDecoded = this.prefixEncoding.deserialize(prefix)
    const keyDecoded = this.keyEncoding.deserialize(key)

    return [prefixDecoded, keyDecoded]
  }

  getKeyRange(prefix: TPrefix): DatabaseKeyRange {
    const encoded = this.prefixEncoding.serialize(prefix)
    this.assertPrefixSize(encoded)
    return StorageUtils.getPrefixKeyRange(encoded)
  }

  private assertPrefixSize(prefix: Buffer): void {
    if (prefix.byteLength !== this.prefixSize) {
      throw new PrefixSizeError(
        `key prefix expected to be byte size ${this.prefixSize} but was ${prefix.byteLength}`,
      )
    }
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

export default class BufferToStringEncoding implements Serde<Buffer, string> {
  serialize(element: Buffer): string {
    return hexArray.toString(element)
  }

  deserialize(data: string): Buffer {
    return Buffer.from(hexArray.fromString(data))
  }

  equals(): boolean {
    throw new Error('You should never use this')
  }
}

export class BigIntLEEncoding implements IDatabaseEncoding<BigInt> {
  serialize(value: bigint): Buffer {
    return BigIntUtils.toBytesLE(value)
  }

  deserialize(buffer: Buffer): bigint {
    return BigIntUtils.fromBytesLE(buffer)
  }
}

export const BUFFER_TO_STRING_ENCODING = new BufferToStringEncoding()
export const BUFFER_ENCODING = new BufferEncoding()
export const U32_ENCODING = new U32Encoding()
