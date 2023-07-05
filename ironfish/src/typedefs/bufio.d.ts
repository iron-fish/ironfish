/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
declare module 'bufio' {
  class StaticWriter {
    render(): Buffer
    slice(): Buffer
    writeDouble(value: number): StaticWriter
    writeDoubleBE(value: number): StaticWriter
    writeU8(value: number): StaticWriter
    writeU16(value: number): StaticWriter
    writeU32(value: number): StaticWriter
    writeU64(value: number): StaticWriter
    writeI64(value: number): StaticWriter
    writeBigU64(value: bigint): StaticWriter
    writeBigI64(value: bigint): StaticWriter
    writeBigU64BE(value: bigint): StaticWriter
    writeBigU128(value: bigint): StaticWriter
    writeBigU128BE(value: bigint): StaticWriter
    writeBigU256(value: bigint): StaticWriter
    writeBigU256BE(value: bigint): StaticWriter
    writeVarint(value: number): StaticWriter
    writeString(value: string, enc: BufferEncoding | null): StaticWriter
    writeVarString(value: string, enc: BufferEncoding | null): StaticWriter
    writeVarBytes(value: Buffer): StaticWriter
    writeBytes(value: Buffer): StaticWriter
    writeHash(value: Buffer | string): StaticWriter
    getSize(): number
  }

  class BufferWriter {
    render(): Buffer
    slice(): Buffer
    writeDouble(value: number): BufferWriter
    writeDoubleBE(value: number): BufferWriter
    writeU8(value: number): BufferWriter
    writeU16(value: number): BufferWriter
    writeU32(value: number): BufferWriter
    writeU64(value: number): BufferWriter
    writeBigU64(value: bigint): BufferWriter
    writeBigU64BE(value: bigint): BufferWriter
    writeBigU128(value: bigint): BufferWriter
    writeBigU128BE(value: bigint): BufferWriter
    writeBigU256(value: bigint): BufferWriter
    writeBigU256BE(value: bigint): BufferWriter
    writeI64(value: number): BufferWriter
    writeBigI64(value: bigint): BufferWriter
    writeVarint(value: number): BufferWriter
    writeString(value: string, enc: BufferEncoding | null): BufferWriter
    writeVarString(value: string, enc: BufferEncoding | null): BufferWriter
    writeVarBytes(value: Buffer): BufferWriter
    writeBytes(value: Buffer): BufferWriter
    writeHash(value: Buffer | string): BufferWriter
    getSize(): number
  }

  class BufferReader {
    offset: number

    seek(offset: number): BufferReader
    left(): number
    readU8(): number
    readU16(): number
    readU32(): number
    readU64(): number
    readU64BE(): number
    readBigU64(): bigint
    readBigU64BE(): bigint
    readBigU128(): bigint
    readBigU128BE(): bigint
    readBigU256(): bigint
    readBigU256BE(): bigint
    readI64(): number
    readBigI64(): bigint
    readFloat(): number
    readFloatBE(): number
    readDoubleBE(): number
    readDouble(): number
    readVarint(): number
    readString(size: number, enc: BufferEncoding | null): string
    readVarString(enc: BufferEncoding | null, limit?: number): string
    readBytes(size: number, zeroCopy?: boolean): Buffer
    readVarBytes(): Buffer

    readHash(enc: BufferEncoding): string
    readHash(enc?: null): Buffer
  }

  export function write(size?: number): StaticWriter | BufferWriter
  export function read(data: Buffer, zeroCopy?: boolean): BufferReader

  export function sizeVarint(value: number): number
  export function sizeVarBytes(value: Buffer): number
  export function sizeVarString(value: string, enc: BufferEncoding): number

  class EncodingError extends Error {}
}
