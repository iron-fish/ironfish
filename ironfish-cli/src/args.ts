/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function parseNumber(input: string): number | null {
  const parsed = Number(input)
  return isNaN(parsed) ? null : parsed
}

/**
 * Oclif currently rejects falsy args as if they weren't included,
 * so this function returns the strings 'true' or 'false' instead. This
 * is fixed in newer versions of oclif.
 */
export function parseBoolean(input: string): 'true' | 'false' | null {
  const lower = input.toLowerCase().trim()
  if (lower === 'true' || lower === 'false') {
    return lower
  }
  return null
}
