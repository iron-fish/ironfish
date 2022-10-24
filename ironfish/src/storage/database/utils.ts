/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../../assert'
import { BufferUtils } from '../../utils'
import { DatabaseKeyRange } from './types'

/**
 * In non relational KV stores, to emulate 'startswith' you often need
 * to use greaterThan and lessThan using the prefix + a glyph marker. To
 * search for "App" in a table containing "Apple", "Application", and "Boat"
 * you would query "gte('App') && lte('App' + 'ff')" Which would return
 * 'Apple' and 'Application'
 */
export function getPrefixKeyRange(prefix: Buffer): DatabaseKeyRange {
  const gte = Buffer.alloc(prefix.byteLength)
  const lt = Buffer.alloc(prefix.byteLength)

  prefix.copy(gte)
  prefix.copy(lt)

  // Because levelDB uses big endian buffers for sorting
  BufferUtils.incrementBE(lt)

  return { gte, lt }
}

export function getPrefixesKeyRange(
  start: Readonly<Buffer>,
  end: Readonly<Buffer>,
): DatabaseKeyRange {
  Assert.isEqual(start.byteLength, end.byteLength, `Start and end must have equal byte length`)

  const gte = Buffer.alloc(start.byteLength)
  const lt = Buffer.alloc(start.byteLength)

  start.copy(gte)
  end.copy(lt)

  // Because levelDB uses big endian buffers for sorting
  BufferUtils.incrementBE(lt)

  return { gte, lt }
}

export const StorageUtils = { getPrefixKeyRange, getPrefixesKeyRange }
