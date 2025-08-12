/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ChainportMemoMetadata } from './metadata'

describe('ChainportMemoMetadata', () => {
  test('convertNumberToBinaryString converts a number to binary string with padding', () => {
    expect(ChainportMemoMetadata.convertNumberToBinaryString(5, 8)).toBe('00000101')
  })

  test('encodeNumberTo10Bits encodes number to 10 bits', () => {
    expect(ChainportMemoMetadata.encodeNumberTo10Bits(5)).toBe('0000000101')
  })

  test('decodeNumberFrom10Bits decodes 10 bits to number', () => {
    expect(ChainportMemoMetadata.decodeNumberFrom10Bits('0000000101')).toBe(5)
  })

  test('encodeCharaterTo6Bits encodes character to 6 bits', () => {
    expect(ChainportMemoMetadata.encodeCharacterTo6Bits('a')).toBe('001010')
    expect(ChainportMemoMetadata.encodeCharacterTo6Bits('1')).toBe('000001')
  })

  test('decodeCharFrom6Bits decodes 6 bits to character', () => {
    expect(ChainportMemoMetadata.decodeCharFrom6Bits('001010')).toBe('a')
    expect(ChainportMemoMetadata.decodeCharFrom6Bits('000001')).toBe('1')
  })

  test('encode encodes networkId, address and to_ironfish flag correctly', () => {
    expect(
      ChainportMemoMetadata.encode(2, '0x5DF170F118753CaE92aaC2868A2C25Ccb6528f9a', false),
    ).toBe('000214d3c11c03c10481c50cc28e24228a30220620a08c08530c2c614220f24a')

    expect(
      ChainportMemoMetadata.encode(22, '0x7A68B1Cf1F16Ef89A566F5606C01BA49F4Eb420A', true),
    ).toBe('02161ca1882c130f04f04638f2092851863c518018c0012ca1093c438b10200a')
  })

  test('decode decodes encoded hex string correctly', () => {
    expect(
      ChainportMemoMetadata.decode(
        '000214d3c11c03c10481c50cc28e24228a30220620a08c08530c2c614220f24a',
      ),
    ).toEqual([2, '0x5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'.toLowerCase(), false])

    expect(
      ChainportMemoMetadata.decode(
        '02161ca1882c130f04f04638f2092851863c518018c0012ca1093c438b10200a',
      ),
    ).toEqual([22, '0x7A68B1Cf1F16Ef89A566F5606C01BA49F4Eb420A'.toLowerCase(), true])

    expect(
      ChainportMemoMetadata.decode(
        '004f99a1a130db7faf2d00d729ad1fc41c76547c5646d10f28e0000000000000',
      ),
    ).toEqual([15, '0x99A1a130DB7FAf2d00d729aD1FC41c76547c5646'.toLowerCase(), false])
  })

  test('encode and decode are reversible v1', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false

    const encoded = ChainportMemoMetadata.encode(networkId, address, toIronfish)
    const decoded = ChainportMemoMetadata.decode(encoded)

    expect(decoded).toEqual([networkId, '0x' + address.toLowerCase(), toIronfish])
  })

  test('encode and decode are reversible v2', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false
    const timestamp = 1753715824
    const version = 1

    const encoded = ChainportMemoMetadata.encodeV2(
      networkId,
      address,
      toIronfish,
      timestamp,
      version,
    )
    const decoded = ChainportMemoMetadata.decode(encoded)

    expect(decoded).toEqual([networkId, '0x' + address.toLowerCase(), toIronfish])
  })

  test('should throw error if networkId is greater than 63', () => {
    const networkId = 64
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false
    const timestamp = 1753715824
    const version = 1

    expect(() =>
      ChainportMemoMetadata.encodeV2(networkId, address, toIronfish, timestamp, version),
    ).toThrow('networkId exceeds 6-bit capacity')
  })

  test('should throw error if version is greater than 3', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false
    const timestamp = 1753715824
    const version = 4

    expect(() =>
      ChainportMemoMetadata.encodeV2(networkId, address, toIronfish, timestamp, version),
    ).toThrow('version exceeds 2-bit capacity')
  })

  test('should throw error if timestamp is greater than 2147483647', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false
    const timestamp = 2147483648
    const version = 1

    expect(() =>
      ChainportMemoMetadata.encodeV2(networkId, address, toIronfish, timestamp, version),
    ).toThrow('timestamp exceeds 31-bit capacity')
  })

  test('should throw error if address is not 40 hexadecimal characters', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9atest'
    const toIronfish = false
    const timestamp = 1753715824
    const version = 1

    expect(() =>
      ChainportMemoMetadata.encodeV2(networkId, address, toIronfish, timestamp, version),
    ).toThrow('address must be 40 hexadecimal characters')
  })

  test('should throw error if memoHex version is not 1 for decodeV2', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false
    const timestamp = 1753715824
    const version = 2

    const encoded = ChainportMemoMetadata.encodeV2(
      networkId,
      address,
      toIronfish,
      timestamp,
      version,
    )

    expect(() => ChainportMemoMetadata.decodeV2(encoded)).toThrow(
      'Unexpected memoHex version: 10',
    )
  })
})
