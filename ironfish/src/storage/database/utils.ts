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
export function getPrefixKeyRange(prefix: Buffer): { gte: Buffer; lt: Buffer } {
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
): { gte: Buffer; lt: Buffer } {
  Assert.isEqual(start.byteLength, end.byteLength, `Start and end must have equal byte length`)

  const gte = Buffer.alloc(start.byteLength)
  const lt = Buffer.alloc(start.byteLength)

  start.copy(gte)
  end.copy(lt)

  // Because levelDB uses big endian buffers for sorting
  BufferUtils.incrementBE(lt)

  return { gte, lt }
}

/**
 * Used to prepend a prefix to each key range condition
 *
 * Useful when you want to limit a range even further to a prefix
 */
export function addPrefixToRange(range: DatabaseKeyRange, prefix: Buffer): DatabaseKeyRange {
  const prefixed: DatabaseKeyRange = {}

  if (range.gt) {
    prefixed.gt = Buffer.concat([prefix, range.gt])
  }

  if (range.gte) {
    prefixed.gte = Buffer.concat([prefix, range.gte])
  }

  if (range.lt) {
    prefixed.lt = Buffer.concat([prefix, range.lt])
  }

  if (range.lte) {
    prefixed.lte = Buffer.concat([prefix, range.lte])
  }

  return prefixed
}

/**
 * Return true if the buffer matches the key ranges
 */
function isInRange(buffer: Buffer, range: DatabaseKeyRange): boolean {
  if (range.gt && range.gt.compare(buffer) >= 0) {
    return false
  }

  if (range.gte && range.gte.compare(buffer) > 0) {
    return false
  }

  if (range.lt && range.lt.compare(buffer) <= 0) {
    return false
  }

  if (range.lte && range.lte.compare(buffer) < 0) {
    return false
  }

  return true
}

function hasPrefix(buffer: Buffer, prefix: Buffer): boolean {
  return buffer.slice(0, prefix.byteLength).equals(prefix)
}

export const StorageUtils = {
  addPrefixToRange,
  getPrefixKeyRange,
  getPrefixesKeyRange,
  hasPrefix,
  isInRange,
}
