/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Accept two bigints and return the larger of the two,
 * in the day of equality, b is returned
 */
function max(a: bigint, b: bigint): bigint {
  if (a > b) {
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

function toBytesBE(value: bigint, size?: number): Buffer {
  const bytes = toBytes(value)

  if (size) {
    const result = Buffer.alloc(size)
    result.set(bytes, size - bytes.length)
    return result
  }

  return bytes
}

function divide(a: bigint, b: bigint): number {
  const div = a / b
  return Number(div) + Number(a - div * b) / Number(b)
}

export const BigIntUtils = {
  toBytes,
  fromBytes,
  toBytesBE,
  max,
  divide,
}
