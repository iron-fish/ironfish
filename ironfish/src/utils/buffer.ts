/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

function toHuman(buffer: Buffer): string {
  return buffer
    .toString('utf8')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
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

export const BufferUtils = {
  toHuman,
  equalsNullable,
  incrementLE,
  incrementBE,
}
