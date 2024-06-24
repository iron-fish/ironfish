/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isEthereumAddress } from './address'

describe('isEthereumAddress', () => {
  test('should return false for an invalid address format', () => {
    expect(isEthereumAddress('0x1')).toBe(false)
    expect(isEthereumAddress('1234')).toBe(false)
    expect(isEthereumAddress('0x1234')).toBe(false)
    // invalid length
    expect(isEthereumAddress('0x123456789012345678901234567890123456789')).toBe(false)
    expect(isEthereumAddress('0x12345678901234567890123456789012345678901')).toBe(false)
    // contains invalid characters
    expect(isEthereumAddress('0x52908400098527886E0f7030069857d2e4169ze7')).toBe(false)
  })

  test('should return true for a valid address format without checksum check', () => {
    expect(isEthereumAddress('0x1234567890123456789012345678901234567890')).toBe(true)
    expect(isEthereumAddress('0X1234567890123456789012345678901234567890')).toBe(false)
  })

  test('should return true for a valid address with correct checksum', () => {
    expect(isEthereumAddress('0x12AE66CDc592e10B60f9097a7b0D3C59fce29876')).toBe(true)
    expect(isEthereumAddress('12AE66CDc592e10B60f9097a7b0D3C59fce29876')).toBe(true)
    // invalid checksum
    expect(isEthereumAddress('0x52908400098527886E0f7030069857d2e4169ee7')).toBe(false)
  })

  test('should return true for an all lowercase valid address', () => {
    expect(isEthereumAddress('0x52908400098527886e0f7030069857d2e4169ee7'.toLowerCase())).toBe(
      true,
    )
    expect(isEthereumAddress('52908400098527886e0f7030069857d2e4169ee7'.toLowerCase())).toBe(
      true,
    )
  })

  test('should handle uppercase addresses correctly', () => {
    expect(
      isEthereumAddress('0x' + '52908400098527886E0f7030069857d2e4169ee7'.toUpperCase()),
    ).toBe(true)
    expect(isEthereumAddress('52908400098527886E0F7030069857D2E4169EE7'.toUpperCase())).toBe(
      true,
    )
  })
})
