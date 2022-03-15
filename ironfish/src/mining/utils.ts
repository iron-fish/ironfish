/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { SerializedBlockTemplate } from '../serde/BlockTemplateSerde'

export function mineableHeaderString(header: SerializedBlockTemplate['header']): Buffer {
  const bw = bufio.write(208)
  bw.writeDoubleBE(header.randomness)
  bw.writeU64(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment.commitment)
  bw.writeU64(header.noteCommitment.size)
  bw.writeHash(header.nullifierCommitment.commitment)
  bw.writeU64(header.nullifierCommitment.size)
  bw.writeHash(header.target)
  bw.writeU64(header.timestamp)
  bw.writeBytes(Buffer.from(header.minersFee, 'hex'))
  bw.writeBytes(Buffer.from(header.graffiti, 'hex'))
  return bw.render()
}

// deserialize into a partial header
export function minedPartialHeader(data: Buffer): SerializedBlockTemplate['header'] {
  const br = bufio.read(data)
  const randomness = br.readDoubleBE()
  const sequence = br.readU64()
  const previousBlockHash = br.readHash()
  const noteCommitment = br.readHash()
  const noteCommitmentSize = br.readU64()
  const nullifierCommitment = br.readHash()
  const nullifierCommitmentSize = br.readU64()
  const target = br.readBytes(32)
  const timestamp = br.readU64()
  const minersFee = br.readBytes(8)
  const graffiti = br.readBytes(32)

  return {
    randomness: randomness,
    sequence: sequence,
    previousBlockHash: previousBlockHash.toString('hex'),
    target: target.toString('hex'),
    timestamp: timestamp,
    minersFee: minersFee.toString('hex'),
    graffiti: graffiti.toString('hex'),
    noteCommitment: {
      commitment: noteCommitment.toString('hex'),
      size: noteCommitmentSize,
    },
    nullifierCommitment: {
      commitment: nullifierCommitment.toString('hex'),
      size: nullifierCommitmentSize,
    },
  }
}
