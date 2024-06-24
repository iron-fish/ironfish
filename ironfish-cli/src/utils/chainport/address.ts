/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import keccak from 'keccak'

function encodeInternal(parsed: RegExpMatchArray | null) {
  if (parsed === null) {
    throw new TypeError('Bad address')
  }

  const addressHex = parsed[1].toLowerCase()
  const forHash = addressHex
  const checksum = keccak('keccak256').update(forHash).digest()

  let ret = '0x'
  for (let i = 0; i < 20; ++i) {
    const byte = checksum[i]
    const ha = addressHex.charAt(i * 2)
    const hb = addressHex.charAt(i * 2 + 1)
    ret += (byte & 0xf0) >= 0x80 ? ha.toUpperCase() : ha
    ret += (byte & 0x0f) >= 0x08 ? hb.toUpperCase() : hb
  }

  return ret
}

export const isEthereumAddress = (address: string) => {
  if (!address.startsWith('0x')) {
    address = '0x' + address
  }
  const parsed = getHex(address)
  if (parsed !== null) {
    if (isOneCase(parsed[1])) {
      return true
    }
    return encodeInternal(parsed) === address
  }
  return false
}

function isOneCase(s: string) {
  return s === s.toLowerCase() || s === s.toUpperCase()
}

function getHex(data: string) {
  return data.match(/^(?:0x)?([0-9a-fA-F]{40})$/)
}
