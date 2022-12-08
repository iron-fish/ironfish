/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import bufio from 'bufio'
import { BigIntUtils, readBigU128, readBigU256, writeBigU128, writeBigU256 } from './bigint'

function littleEndianTest(value: BigInt, bits: number): Buffer {
  const bitString = ('0'.repeat(bits) + value.toString(2)).slice(-bits)
  const bytes = bitString.match(/[01]{8}/g) || []
  const leBytes = bytes.map((binary) => parseInt(binary, 2)).reverse()

  return Buffer.from(new Uint8Array(leBytes))
}

describe('BigIntUtils', () => {
  it('converts bigints to bytes and back', () => {
    const bigints = [
      BigInt(0),
      BigInt(
        '9999999999999999999999999999999999999999999999999999999999999999999999999999999999',
      ),
      BigInt(255),
      BigInt(256),
      BigInt(1024),
      BigInt(1025),
    ]

    for (const candidate of bigints) {
      const bytes = BigIntUtils.toBytes(candidate)
      const back = BigIntUtils.fromBytes(bytes)
      expect(back).toEqual(candidate)
    }
  })

  it('can convert to a little-endian representation', () => {
    const bigint = BigInt(258)

    const bigintBuffer = BigIntUtils.toBytesLE(bigint, 2)

    const buffer = Buffer.alloc(2)
    buffer.writeUInt16LE(Number(bigint))

    expect(bigintBuffer).toEqual(buffer)

    const back = BigIntUtils.fromBytesLE(bigintBuffer)
    expect(back).toEqual(bigint)
  })

  it('converts empty array to 0', () => {
    expect(BigIntUtils.fromBytes(Buffer.from([]))).toEqual(BigInt(0))
  })

  it('divides bigint', () => {
    const max = BigInt(Number.MAX_SAFE_INTEGER)

    let result = BigIntUtils.divide(max, max + max)
    expect(result).toBeCloseTo(0.5, 2)

    result = BigIntUtils.divide(max, max)
    expect(result).toBe(1)

    result = BigIntUtils.divide(BigInt(0), max)
    expect(result).toBe(0)

    result = BigIntUtils.divide(max, BigInt(2))
    expect(result).toBe(Number(max) / 2)

    const withPrecision = BigIntUtils.divide(10000n, 37n)
    const withoutPrecision = Number(10000n / 37n)
    const withPrecision2 = 10000 / 37

    expect(withPrecision).toBeGreaterThan(withoutPrecision)
    expect(withPrecision).toBe(withPrecision2)
  })

  it('can convert a 128 bit bigint to a little-endian representation', () => {
    const value = 2n ** 127n + 63542n

    const bw = bufio.write(16)
    writeBigU128(bw, value)
    const serialized = bw.render()

    expect(serialized).toEqual(littleEndianTest(value, 128))

    const reader = bufio.read(serialized, true)

    const deserialized = readBigU128(reader)

    expect(deserialized).toEqual(value)
  })

  it('can convert a 256 bit bigint to a little-endian representation', () => {
    const value = 2n ** 255n + 354532n

    const bw = bufio.write(32)
    writeBigU256(bw, value)
    const serialized = bw.render()

    expect(serialized).toEqual(littleEndianTest(value, 256))

    const reader = bufio.read(serialized, true)

    const deserialized = readBigU256(reader)

    expect(deserialized).toEqual(value)
  })
})
