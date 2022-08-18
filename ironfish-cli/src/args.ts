/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export function parseNumber(input: string): number | null {
  return Number(input.trim()) ?? null
}

export function parseNumberChecked(input: string, name?: string): number {
  const parsed = Number(input.trim())

  if (!parsed) {
    throw TypeError(`Invalid ${name ?? 'value'} "${input}", expected a number`)
  }

  return parsed
}
