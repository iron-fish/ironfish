/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Chainport memo metadata encoding and decoding
 * The metadata is encoded in a 64 character hex string
 * The first bit is a flag to indicate if the transaction is to IronFish or from IronFish
 * The next 10 bits are the network id
 * The rest of the bits are the address
 *
 * Official documentation: https://docs.chainport.io/for-developers/integrate-chainport/iron-fish/utilities/ironfishmetadata
 */
export class ChainportMemoMetadata {
  constructor() {}

  public static convertNumberToBinaryString(num: number, padding: number) {
    return num.toString(2).padStart(padding, '0')
  }

  public static encodeNumberTo10Bits(number: number) {
    return this.convertNumberToBinaryString(number, 10)
  }

  public static decodeNumberFrom10Bits(bits: string) {
    return parseInt('0' + bits.slice(1, 10), 2)
  }

  public static encodeCharacterTo6Bits(character: string) {
    const parsedInt = parseInt(character)
    if (!isNaN(parsedInt)) {
      return this.convertNumberToBinaryString(parsedInt, 6)
    }

    const int = character.charCodeAt(0) - 'a'.charCodeAt(0) + 10
    return this.convertNumberToBinaryString(int, 6)
  }

  public static decodeCharFrom6Bits(bits: string) {
    const num = parseInt(bits, 2)
    if (num < 10) {
      return num.toString()
    }
    return String.fromCharCode(num - 10 + 'a'.charCodeAt(0))
  }

  public static convertHexToBinary(encodedHex: string): string {
    const buffer = Buffer.from(encodedHex, 'hex')
    let binaryString = ''
    for (let i = 0; i < buffer.length; i++) {
      binaryString += buffer[i].toString(2).padStart(8, '0')
    }
    return binaryString
  }

  public static encode(networkId: number, address: string, toIronfish: boolean) {
    if (address.startsWith('0x')) {
      address = address.slice(2)
    }

    const encodedNetworkId = this.encodeNumberTo10Bits(networkId)
    const encodedAddress = address
      .toLowerCase()
      .split('')
      .map((character: string) => {
        return this.encodeCharacterTo6Bits(character)
      })
      .join('')

    const combined = (toIronfish ? '1' : '0') + (encodedNetworkId + encodedAddress).slice(1)
    const hexString = BigInt('0b' + combined).toString(16)
    return hexString.padStart(64, '0')
  }

  public static encodeV2(
    networkId: number,
    address: string,
    toIronfish: boolean,
    timestamp: number,
    version: number,
  ) {
    if (networkId >= 1 << 6) {
      throw new Error('networkId exceeds 6-bit capacity')
    }
    if (version >= 1 << 2) {
      throw new Error('version exceeds 2-bit capacity')
    }
    if (BigInt(timestamp) >= 1n << 31n) {
      throw new Error('timestamp exceeds 31-bit capacity')
    }

    let addressClean = address
    if (addressClean.startsWith('0x')) {
      addressClean = addressClean.slice(2)
    }

    if (addressClean.length !== 40) {
      throw new Error('address must be 40 hexadecimal characters')
    }

    const addrBytes = Buffer.from(addressClean, 'hex')

    if (addrBytes.length !== 20) {
      throw new Error('address must decode to 20 bytes')
    }

    const bitArray: number[] = new Array(256).fill(0) as number[]
    let pos = 0

    pos += 6

    bitArray[pos] = toIronfish ? 1 : 0
    pos += 1

    pos += 1

    bitArray[pos] = (version >> 1) & 1
    bitArray[pos + 1] = version & 1
    pos += 2

    for (let i = 0; i < 6; i++) {
      bitArray[pos + i] = (networkId >> (5 - i)) & 1
    }
    pos += 6

    for (const byte of addrBytes) {
      for (let i = 0; i < 8; i++) {
        bitArray[pos] = (byte >> (7 - i)) & 1
        pos += 1
      }
    }

    for (let i = 0; i < 31; i++) {
      bitArray[pos + i] = (timestamp >> (30 - i)) & 1
    }
    pos += 31

    pos += 49

    const result = new Uint8Array(32)
    for (let i = 0; i < 32; i++) {
      let byte = 0
      for (let j = 0; j < 8; j++) {
        byte = (byte << 1) | bitArray[i * 8 + j]
      }
      result[i] = byte
    }

    return Array.from(result)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  public static decodeV1(encodedHex: string): [number, string, boolean] {
    const hexInteger = BigInt('0x' + encodedHex)
    const encodedString = hexInteger.toString(2)
    const padded = encodedString.padStart(250, '0')
    const networkId = this.decodeNumberFrom10Bits(padded)

    const toIronfish = padded[0] === '1'
    const addressCharacters = []

    for (let i = 10; i < padded.length; i += 6) {
      const j = i + 6
      const charBits = padded.slice(i, j)
      addressCharacters.push(this.decodeCharFrom6Bits(charBits))
    }

    const address = '0x' + addressCharacters.join('')

    return [networkId, address.toLowerCase(), toIronfish]
  }

  public static decodeV2(encodedHex: string): [number, string, boolean] {
    const bits = this.convertHexToBinary(encodedHex)
    const toIronfish = bits[6] === '1'
    const memoHexVersion = bits.slice(8, 10)
    if (memoHexVersion !== '01') {
      throw new Error(`Unexpected memoHex version: ${memoHexVersion}`)
    }

    const networkIdBits = bits.slice(10, 16)
    const networkId = parseInt(networkIdBits, 2)
    const addressBits = bits.slice(16, 176)
    let address = '0x'
    for (let i = 0; i < addressBits.length; i += 4) {
      address += parseInt(addressBits.slice(i, i + 4), 2).toString(16)
    }

    return [networkId, address.toLowerCase(), toIronfish]
  }

  public static decode(encodedHex: string): [number, string, boolean] {
    const bits = this.convertHexToBinary(encodedHex)
    const memoHexVersion = bits.slice(8, 10)
    if (memoHexVersion === '01') {
      return this.decodeV2(encodedHex)
    }
    return this.decodeV1(encodedHex)
  }
}
