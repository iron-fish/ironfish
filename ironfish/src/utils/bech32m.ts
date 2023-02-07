/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bech32m } from 'bech32'
import { Assert } from '../assert'

// 1023 is maximum character count where the checksum will still catch errors
function decode(bech32String: string, limit = 1023): [string, null] | [null, Error] {
  const decoded = bech32m.decodeUnsafe(bech32String, limit)

  if (decoded === undefined) {
    return [null, new Error(`Failed to decode`)]
  }

  const bytes = bech32m.fromWordsUnsafe(decoded.words)

  if (bytes === undefined) {
    return [null, new Error(`Failed to get bytes from words`)]
  }

  const output = Buffer.from(bytes).toString('utf8')
  return [output, null]
}

function encode(input: string, prefix: string, limit = 1023): string {
  Assert.isTruthy(prefix, `Prefix is required by bech32`)

  const bytes = Buffer.from(input, 'utf8')
  const words = bech32m.toWords(bytes)
  const encoded = bech32m.encode(prefix, words, limit)

  return encoded
}

export const Bech32m = {
  encode,
  decode,
}
