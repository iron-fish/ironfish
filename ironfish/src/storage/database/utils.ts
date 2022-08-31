/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DatabaseKeyRange } from './types'

/**
 * In non relational KV stores, to emulate 'startswith' you often need
 * to use greaterThan and lessThan using the prefix + a glyph marker. To
 * search for "App" in a table containing "Apple", "Application", and "Boat"
 * you would query "gte('App') && lte('App' + 'ff')" Which would return
 * 'Apple' and 'Application'
 */
export function getPrefixKeyRange(prefix: Buffer, byteLength?: number): DatabaseKeyRange {
  if (byteLength === undefined) {
    byteLength = prefix.byteLength
  }

  const prefixHex = prefix.toString('hex')
  const prefixNumber = parseInt(prefixHex, 16)

  const gte = Buffer.alloc(byteLength)
  gte.writeUIntBE(prefixNumber, 0, byteLength)

  const lt = Buffer.alloc(byteLength)
  lt.writeUIntBE(prefixNumber + 1, 0, byteLength)

  return { gte, lt }
}

export const StorageUtils = { getPrefixKeyRange }
