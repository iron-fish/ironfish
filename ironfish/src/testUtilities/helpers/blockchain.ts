/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../matchers/blockchain'
import {
  Asset,
  generateKey,
  Note as NativeNote,
  Transaction as NativeTransaction,
} from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import { Blockchain } from '../../blockchain'
import { Transaction } from '../../primitives'
import { Block } from '../../primitives/block'
import { BlockHeader, transactionCommitment } from '../../primitives/blockheader'
import { Target } from '../../primitives/target'
import { GraffitiUtils } from '../../utils/graffiti'

export async function makeBlockAfter(
  chain: Blockchain,
  after: BlockHeader | Block,
): Promise<Block> {
  if (after instanceof Block) {
    after = after.header
  }

  const sequence = after.sequence + 1
  const miningReward = BigInt(chain.strategy.miningReward(sequence))

  if (miningReward !== BigInt(0)) {
    throw new Error(`Must have mining reward disabled but was ${miningReward}`)
  }

  const timestamp = new Date()
  const target = Target.calculateTarget(
    timestamp,
    after.timestamp,
    after.target,
    chain.consensus.parameters.targetBlockTimeInSeconds,
    chain.consensus.parameters.targetBucketTimeInSeconds,
  )
  const randomness = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
  const graffiti = GraffitiUtils.fromString('fake block')

  const key = generateKey()
  const owner = key.public_address
  const minerNote = new NativeNote(owner, BigInt(0), '', Asset.nativeId(), owner)
  const transaction = new NativeTransaction(key.spending_key)
  transaction.receive(minerNote)
  const minerTransaction = new Transaction(transaction.post_miners_fee())

  const noteCommitment = await chain.db.withTransaction(null, async (tx) => {
    await chain.notes.addBatch(minerTransaction.notes, tx)
    const commitment = await chain.notes.rootHash(tx)
    await tx.abort()
    return commitment
  })

  const header = new BlockHeader(
    sequence,
    after.hash,
    noteCommitment,
    transactionCommitment([minerTransaction]),
    target,
    randomness,
    timestamp,
    graffiti,
    after.noteSize,
    BigInt(1),
  )

  const block = new Block(header, [minerTransaction])

  Assert.isUndefined((await chain.verifier.verifyBlock(block)).reason)
  return block
}

export function acceptsAllTarget(): Target {
  return new Target(BigInt(2) ** BigInt(256) - BigInt(1))
}
