/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Assert } from '../assert'

const BITS_64_1S = BigInt(2) ** BigInt(64) - 1n
const BITS_128_1S = BigInt(2) ** BigInt(128) - 1n
const BITS_256_1S = BigInt(2) ** BigInt(256) - 1n
/**
 * Accept two bigints and return the larger of the two,
 * in the case of equality, b is returned
 */
function max(a: bigint, b: bigint): bigint {
  if (a > b) {
    return a
  } else {
    return b
  }
}

/**
 * Accept two bigints and return the smaller of the two,
 * in the case of equality, b is returned
 */
function min(a: bigint, b: bigint): bigint {
  if (a < b) {
    return a
  } else {
    return b
  }
}

/**
 * Courtesy of https://coolaj86.com/articles/convert-js-bigints-to-typedarrays/
 *
 * Convert a Buffer to a big integer number, in big endian format.
 *
 * I'm concerned about efficiency here. Converting a string and back and... WTF?
 * Every block hash attempt has to be converted to a Target, so this is a function
 * that should be optimized. We may want to compile this to wasm if there isn't
 * a less janky way to do it.
 *
 * I'm pushing it out like this for now so I can focus on bigger architecture concerns.
 *
 * Sorry.
 */
function fromBytes(bytes: Buffer): bigint {
  if (bytes.length === 0) {
    return BigInt(0)
  }

  const hex: string[] = []

  bytes.forEach(function (i) {
    let h = i.toString(16)
    if (h.length % 2) {
      h = '0' + h
    }
    hex.push(h)
  })

  return BigInt('0x' + hex.join(''))
}

function fromBytesLE(bytes: Buffer): bigint {
  return fromBytes(bytes.reverse())
}

/**
 * Writes a bigint to a Buffer, in big endian format.
 *
 * TODO: Handle negative numbers, or add an assertion that the
 * incoming bigint is non-negative, and fix the places where we're calling
 * it with a negative number (at least one place is miners fee serialization)
 */
function toBytes(value: bigint): Buffer {
  let hex = value.toString(16)
  if (hex.length % 2) {
    hex = '0' + hex
  }

  const len = hex.length / 2
  const u8 = Buffer.alloc(len)

  let i = 0
  let j = 0
  while (i < len) {
    u8[i] = parseInt(hex.slice(j, j + 2), 16)
    i += 1
    j += 2
  }

  return u8
}

/**
 * Read 256 bits of an instantiated BufferReader and parse as a positive BigInt.
 * Reads the bits as Little Endian encoding
 */
export function readBigU256(reader: bufio.BufferReader): bigint {
  const lo = readBigU128(reader)
  const hi = readBigU128(reader)

  return (BigInt(hi) << 128n) | BigInt(lo)
}

/**
 * Read 128 bits of an instantiated BufferReader and parse as a positive BigInt.
 * Reads the bits as Little Endian encoding
 */
export function readBigU128(reader: bufio.BufferReader): bigint {
  const lo = reader.readBigU64()
  const hi = reader.readBigU64()

  return (BigInt(hi) << 64n) | BigInt(lo)
}

/**
 * Write 128 bits of a positive BigInt to an instantiated BufferWriter.
 * Writes the bits in Little Endian encoding
 */
export function writeBigU128(
  writer: bufio.BufferWriter | bufio.StaticWriter,
  value: bigint,
): bufio.BufferWriter | bufio.StaticWriter {
  Assert.isTrue(typeof value === 'bigint')
  Assert.isTrue(value >= 0n)

  // Truncate BigInt to 128 bits
  const val128 = value & BITS_128_1S

  const hi = val128 >> BigInt(64)
  const lo = val128 & BITS_64_1S

  writer.writeBigU64(lo)

  return writer.writeBigU64(hi)
}

/**
 * Write 256 bits of a positive BigInt to an instantiated BufferWriter.
 * Writes the bits in Little Endian encoding
 */
export function writeBigU256(
  writer: bufio.BufferWriter | bufio.StaticWriter,
  value: bigint,
): bufio.BufferWriter | bufio.StaticWriter {
  Assert.isTrue(typeof value === 'bigint')
  Assert.isTrue(value >= 0n)

  // Truncate BigInt to 256 bits
  const val256 = value & BITS_256_1S

  const hi = val256 >> BigInt(128)
  const lo = val256 & BITS_128_1S

  writeBigU128(writer, lo)

  return writeBigU128(writer, hi)
}

/**
 * TODO: Handle negative numbers, or add an assertion that the
 * incoming bigint is non-negative, and fix the places where we're calling
 * it with a negative number (at least one place is miners fee serialization)
 */
function toBytesLE(value: bigint, size?: number): Buffer {
  return toBytesBE(value, size).reverse()
}

/**
 * TODO: Handle negative numbers, or add an assertion that the
 * incoming bigint is non-negative, and fix the places where we're calling
 * it with a negative number (at least one place is miners fee serialization)
 */
function toBytesBE(value: bigint, size?: number): Buffer {
  const bytes = toBytes(value)

  if (size) {
    const result = Buffer.alloc(size)
    result.set(bytes, size - bytes.length)
    return result
  }

  return bytes
}

/**
 * Divides two BigInt types and returns a number. That has floating
 * point precision. Regular BigInt division will not have decimals
 */
function divide(a: bigint, b: bigint): number {
  const div = a / b
  return Number(div) + Number(a - div * b) / Number(b)
}

function tryParse(value: string): [bigint, null] | [null, Error] {
  try {
    return [BigInt(value), null]
  } catch (e) {
    if (e instanceof SyntaxError) {
      return [null, e]
    }
    throw e
  }
}

export const BigIntUtils = {
  toBytes,
  fromBytes,
  fromBytesLE,
  toBytesBE,
  toBytesLE,
  max,
  min,
  divide,
  tryParse,
}
