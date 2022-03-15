/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GRAFFITI_SIZE } from '../consensus/consensus'

function fromString(graffiti: string): Buffer {
  const result = Buffer.alloc(GRAFFITI_SIZE)
  result.write(graffiti)
  return result
}

function toHuman(graffiti: Buffer): string {
  return graffiti
    .toString('utf8')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
}

export const GraffitiUtils = {
  fromString,
  toHuman,
}
