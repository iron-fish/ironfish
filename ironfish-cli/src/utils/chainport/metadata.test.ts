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
  })

  test('encode and decode are reversible', () => {
    const networkId = 2
    const address = '5DF170F118753CaE92aaC2868A2C25Ccb6528f9a'
    const toIronfish = false

    const encoded = ChainportMemoMetadata.encode(networkId, address, toIronfish)
    const decoded = ChainportMemoMetadata.decode(encoded)

    expect(decoded).toEqual([networkId, '0x' + address.toLowerCase(), toIronfish])
  })
})
