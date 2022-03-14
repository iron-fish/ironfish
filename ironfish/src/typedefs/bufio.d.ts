/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
declare module 'bufio' {
  class StaticWriter {
    render(): Buffer
    slice(): Buffer
    writeU8(value: number): StaticWriter
    writeU64(value: number): StaticWriter
    writeI64(value: number): StaticWriter
    writeVarString(value: string, enc?: BufferEncoding | null): StaticWriter
    writeVarBytes(value: Buffer): StaticWriter
    writeBytes(value: Buffer): StaticWriter
    writeHash(value: Buffer | string): StaticWriter
    getSize(): number
  }

  class BufferWriter {
    render(): Buffer
    slice(): Buffer
    writeU8(value: number): BufferWriter
    writeU64(value: number): BufferWriter
    writeI64(value: number): BufferWriter
    writeVarString(value: string, enc?: BufferEncoding | null): BufferWriter
    writeVarBytes(value: Buffer): BufferWriter
    writeBytes(value: Buffer): BufferWriter
    writeHash(value: Buffer | string): BufferWriter
    getSize(): number
  }

  class BufferReader {
    readU8(): number
    readU64(): number
    readVarString(enc?: BufferEncoding | null, limit?: number): string
    readVarBytes(): Buffer
    readBytes(size: number, zeroCopy?: boolean): Buffer

    readHash(enc: BufferEncoding): string
    readHash(enc?: null): Buffer
  }

  export function write(size?: number): StaticWriter | BufferWriter
  export function read(data: Buffer, zeroCopy?: boolean): BufferReader

  export function sizeVarBytes(value: Buffer): number
  export function sizeVarString(value: string, enc?: BufferEncoding): number
}
