/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { StringUtils } from './string'

function toHuman(buffer: Buffer): string {
  return StringUtils.sanitizeString(buffer.toString('utf8'))
}

function incrementLE(buffer: Buffer): void {
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i]++ !== 255) {
      break
    }
  }
}

function incrementBE(buffer: Buffer): void {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i]++ !== 255) {
      break
    }
  }
}

function equalsNullable(a: Buffer | null | undefined, b: Buffer | null | undefined): boolean {
  return a == null || b == null ? a === b : a.equals(b)
}

function maxNullable(
  a: Buffer | null | undefined,
  b: Buffer | null | undefined,
): Buffer | undefined {
  if (!a) {
    return b ? b : undefined
  } else if (!b) {
    return a
  } else {
    return Buffer.compare(a, b) > 0 ? a : b
  }
}

function minNullable(
  a: Buffer | null | undefined,
  b: Buffer | null | undefined,
): Buffer | undefined {
  if (!a) {
    return b ? b : undefined
  } else if (!b) {
    return a
  } else {
    return Buffer.compare(a, b) <= 0 ? a : b
  }
}

export const BufferUtils = {
  toHuman,
  equalsNullable,
  incrementLE,
  incrementBE,
  maxNullable,
  minNullable,
}
