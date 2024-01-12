/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FishHashContext } from '@ironfish/rust-nodejs'
import { blake3 } from '@napi-rs/blake-hash'
import bufio from 'bufio'
import { Assert } from './assert'
import { Consensus } from './consensus'
import { BlockHash, RawBlockHeader } from './primitives/blockheader'

export class BlockHasher {
  readonly consensus: Consensus
  readonly fishHashContext: FishHashContext | null = null

  constructor(options: { consensus: Consensus; fullCache?: boolean }) {
    this.consensus = options.consensus
    if (this.consensus.parameters.enableFishHash !== 'never') {
      this.fishHashContext = new FishHashContext(!!options.fullCache)
    }
  }

  hashHeader(header: RawBlockHeader): BlockHash {
    const useFishHash = this.consensus.isActive(
      this.consensus.parameters.enableFishHash,
      header.sequence,
    )

    if (useFishHash) {
      Assert.isNotNull(this.fishHashContext, 'FishHash context was not initialized')

      const serialized = serializeHeaderFishHash(header)
      return this.fishHashContext.hash(serialized)
    }

    const serialized = serializeHeaderBlake3(header)
    return blake3(serialized)
  }
}

function serializeHeaderBlake3(header: RawBlockHeader): Buffer {
  const bw = bufio.write(180)
  bw.writeBigU64BE(header.randomness)
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(header.transactionCommitment)
  bw.writeBigU256BE(header.target.asBigInt())
  bw.writeU64(header.timestamp.getTime())
  bw.writeBytes(header.graffiti)

  return bw.render()
}

function serializeHeaderFishHash(header: RawBlockHeader): Buffer {
  const bw = bufio.write(180)
  bw.writeBytes(header.graffiti)
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(header.transactionCommitment)
  bw.writeBigU256BE(header.target.asBigInt())
  bw.writeU64(header.timestamp.getTime())
  bw.writeBigU64BE(header.randomness)

  return bw.render()
}
