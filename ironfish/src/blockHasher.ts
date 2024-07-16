/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FishHashContext } from '@ironfish/rust-nodejs'
import { blake3 } from '@napi-rs/blake-hash'
import bufio from 'bufio'
import { Assert } from './assert'
import { Consensus } from './consensus'
import { BlockHash, getHeaderSize, RawBlockHeader } from './primitives/blockheader'

export class BlockHasher {
  private readonly consensus: Consensus
  private readonly fishHashContext: FishHashContext | null = null

  constructor(options: { consensus: Consensus; context?: FishHashContext }) {
    this.consensus = options.consensus

    if (this.consensus.isNeverActive('enableFishHash')) {
      this.fishHashContext = null
    } else {
      this.fishHashContext = options.context ?? new FishHashContext(false)
    }
  }

  serializeHeader(header: RawBlockHeader): Buffer {
    if (this.consensus.isActive('enableFishHash', header.sequence)) {
      return serializeHeaderFishHash(header)
    }

    return serializeHeaderBlake3(header)
  }

  hashHeader(header: RawBlockHeader): BlockHash {
    const evmActive = this.consensus.isActive('enableEvmDescriptions', header.sequence)
    const useFishHash = this.consensus.isActive('enableFishHash', header.sequence)

    if (evmActive) {
      Assert.isNotUndefined(header.stateCommitment)
    }

    if (useFishHash) {
      Assert.isNotNull(this.fishHashContext, 'FishHash context was not initialized')

      const serialized = serializeHeaderFishHash(header)
      return this.fishHashContext.hash(serialized)
    }

    const serialized = serializeHeaderBlake3(header)
    return blake3(serialized)
  }
}

export function serializeHeaderBlake3(header: RawBlockHeader): Buffer {
  const bw = bufio.write(getHeaderSize(header))
  bw.writeBigU64BE(header.randomness)
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(header.transactionCommitment)
  bw.writeBigU256BE(header.target.asBigInt())
  bw.writeU64(header.timestamp.getTime())
  bw.writeBytes(header.graffiti)
  if (header.stateCommitment) {
    bw.writeHash(header.stateCommitment)
  }

  return bw.render()
}

export function serializeHeaderFishHash(header: RawBlockHeader): Buffer {
  const bw = bufio.write(getHeaderSize(header))
  bw.writeBytes(header.graffiti)
  bw.writeU32(header.sequence)
  bw.writeHash(header.previousBlockHash)
  bw.writeHash(header.noteCommitment)
  bw.writeHash(header.transactionCommitment)
  bw.writeBigU256BE(header.target.asBigInt())
  bw.writeU64(header.timestamp.getTime())
  bw.writeBigU64BE(header.randomness)
  if (header.stateCommitment) {
    bw.writeHash(header.stateCommitment)
  }

  return bw.render()
}
