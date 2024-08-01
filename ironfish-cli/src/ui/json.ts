/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import jsonColorizer from 'json-colorizer'

export function json(data: unknown): string {
  let output = data

  // Only try to stringify JSON output if it is not already a string
  if (typeof data !== 'string') {
    output = JSON.stringify(data, undefined, '  ')
  }

  return jsonColorizer(output)
}
