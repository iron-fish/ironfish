/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BlockHash } from '../blockchain'
import { createHash } from 'blake3-wasm'

export default function hashBlockHeader(serializedHeader: Buffer): BlockHash {
  const hash = createHash()
  hash.update(serializedHeader)
  return hash.digest()
}
