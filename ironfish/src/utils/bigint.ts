/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'

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
function fromBytesBE(bytes: Buffer): bigint {
  if (bytes.length === 0) {
    return 0n
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
  return fromBytesBE(bytes.reverse())
}

/**
 * Writes a bigint to a Buffer, in big endian format.
 *
 * TODO: Handle negative numbers, or add an assertion that the
 * incoming bigint is non-negative, and fix the places where we're calling
 * it with a negative number (at least one place is miners fee serialization)
 */
function toBytesBE(value: bigint): Buffer {
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
 * TODO: Handle negative numbers, or add an assertion that the
 * incoming bigint is non-negative, and fix the places where we're calling
 * it with a negative number (at least one place is miners fee serialization)
 */
function toBytesLE(value: bigint): Buffer {
  return toBytesBE(value).reverse()
}

function writeBigU64BE(value: bigint): Buffer {
  return bufio.write(8).writeBigU64BE(value).render()
}

function writeBigU256BE(value: bigint): Buffer {
  return bufio.write(32).writeBigU256BE(value).render()
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
  fromBytesBE,
  fromBytesLE,
  toBytesBE,
  toBytesLE,
  max,
  min,
  divide,
  tryParse,
  writeBigU64BE,
  writeBigU256BE,
}
