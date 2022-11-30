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

// deserialize into a partial header
export function minedPartialHeader(data: Buffer): SerializedBlockTemplate['header'] {
  const br = bufio.read(data)
  const randomness = br.readBytes(8)
  const sequence = br.readU32()
  const previousBlockHash = br.readHash()
  const noteCommitment = br.readHash()
  const transactionCommitment = br.readHash()
  const target = br.readBytes(32)
  const timestamp = br.readU64()
  const graffiti = br.readBytes(32)

  return {
    randomness: randomness.toString('hex'),
    sequence: sequence,
    previousBlockHash: previousBlockHash.toString('hex'),
    target: target.toString('hex'),
    timestamp: timestamp,
    graffiti: graffiti.toString('hex'),
    noteCommitment: noteCommitment.toString('hex'),
    transactionCommitment: transactionCommitment.toString('hex'),
  }
}
