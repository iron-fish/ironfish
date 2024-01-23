/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { SerializedBlockTemplate } from '../serde/BlockTemplateSerde'

const MINEABLE_BLOCK_HEADER_SIZE = 180
export const MINEABLE_BLOCK_HEADER_GRAFFITI_OFFSET = MINEABLE_BLOCK_HEADER_SIZE - 32

export function mineableHeaderString(header: SerializedBlockTemplate['header']): Buffer {
  const bw = bufio.write(MINEABLE_BLOCK_HEADER_SIZE)
  bw.writeBytes(Buffer.from(header.randomness, 'hex'))
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(Buffer.from(header.transactionCommitment, 'hex'))
  bw.writeHash(header.target)
  bw.writeU64(header.timestamp)
  bw.writeBytes(Buffer.from(header.graffiti, 'hex'))
  return bw.render()
}
