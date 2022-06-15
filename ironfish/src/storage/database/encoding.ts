/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import hexArray from 'hex-array'
import { IJSON, IJsonSerializable, Serde } from '../../serde'
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

export class BufferEncoding implements IDatabaseEncoding<Buffer> {
  serialize = (value: Buffer): Buffer => value
  deserialize = (buffer: Buffer): Buffer => buffer
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

export const BUFFER_TO_STRING_ENCODING = new BufferToStringEncoding()
export const BUFFER_ENCODING = new BufferEncoding()
export const U32_ENCODING = new U32Encoding()
