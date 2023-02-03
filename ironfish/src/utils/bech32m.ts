/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bech32m } from 'bech32'

// 1023 is maximum character count where the checksum will still catch errors
function decode(bech32String: string): [string, null] | [null, Error] {
  try {
    const decodedOutput = bech32m.decode(bech32String, 1023)
    const decodedBytes = bech32m.fromWords(decodedOutput.words)
    return [Buffer.from(decodedBytes).toString(), null]
  } catch (err) {
    if (err instanceof Error) {
      return [null, err]
    }
    throw err
  }
}

function encode(input: string, prefix: string): [string, null] | [null, Error] {
  if (prefix === '') {
    return [null, Error('prefix must have defined value')]
  }
  if (input === '') {
    return [null, Error('input string must have defined value')]
  }
  const bytes = Buffer.from(input)
  const words = bech32m.toWords(bytes)
  return [bech32m.encode(prefix, words, 1023), null]
}

export const Bech32m = {
  encode,
  decode,
}
