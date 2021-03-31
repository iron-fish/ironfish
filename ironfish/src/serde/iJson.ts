/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import BJSON from 'buffer-json'

/**
 * IJSON, for Iron Fish JSON. Supports parsing/stringifying Buffers and BigInts.
 */
export const IJSON = {
  stringify(value: unknown, space?: string | number): string {
    return JSON.stringify(
      value,
      (key, value) =>
        typeof value === 'bigint'
          ? `${value.toString()}n`
          : (BJSON.replacer(key, value) as unknown),
      space,
    )
  },

  parse(text: string): unknown {
    return JSON.parse(text, (key, value) => {
      if (typeof value === 'string' && value.endsWith('n') && value.length > 1) {
        const slice = value.slice(0, value.length - 1)
        const sliceWithoutMinus = slice.startsWith('-') ? slice.slice(1) : slice
        // If every character except the last is a number, parse as a bigint
        if (sliceWithoutMinus.split('').every((char) => !isNaN(Number(char)))) {
          return BigInt(slice)
        }
      }
      return BJSON.reviver(key, value) as unknown
    })
  },
}
