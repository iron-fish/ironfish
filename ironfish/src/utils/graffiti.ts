/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { GRAFFITI_SIZE } from '../primitives/block'

function fromString(graffiti: string): Buffer {
  const result = Buffer.alloc(GRAFFITI_SIZE)
  result.write(graffiti)
  return result
}

export const GraffitiUtils = {
  fromString,
}
