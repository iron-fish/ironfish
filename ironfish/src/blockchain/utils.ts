/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Transaction } from '../primitives/transaction'
import { JsonSerializable } from '../serde'
import { IDatabaseTransaction } from '../storage'
import { Blockchain } from './blockchain'

/**
 * Sanity check to check that heaviest head exists, and trees match it
 * If we just added a block that puts trees in a bad state, abort it
 * as its incorrect
 */
export async function checkTreeMatchesHeaviest<
  E,
  H,
  T extends Transaction<E, H>,
  SE extends JsonSerializable,
  SH extends JsonSerializable,
  ST
>(chain: Blockchain<E, H, T, SE, SH, ST>, tx?: IDatabaseTransaction): Promise<boolean> {
  const noteRoot = await chain.notes.rootHash(tx)
  const nullifierRoot = await chain.nullifiers.rootHash(tx)

  const heaviestHead = chain.head
  if (!heaviestHead) {
    chain.logger.error(`No heaviest head — should never happen`)
    return false
  }

  const heaviestBlock = await chain.getBlock(heaviestHead.hash, tx)
  if (!heaviestBlock) {
    chain.logger.error(`No heaviest block — should never happen`)
    return false
  }

  if (
    !chain.strategy
      .noteHasher()
      .hashSerde()
      .equals(noteRoot, heaviestBlock.header.noteCommitment.commitment)
  ) {
    const blockNoteSize = heaviestBlock.header.noteCommitment.size
    const noteSize = await chain.notes.size(tx)

    const noteRootSerialized = chain.strategy.noteHasher().hashSerde().serialize(noteRoot)
    const blockRootSerialized = chain.strategy
      .noteHasher()
      .hashSerde()
      .serialize(heaviestBlock.header.noteCommitment.commitment)

    chain.logger.error(
      `Note Merkle Tree is in a BAD STATE: \n
      Heaviest head is ${heaviestBlock.header.hash.toString('hex')} seq ${
        heaviestBlock.header.sequence
      }
        Note tree size: ${noteSize} \n
        Note root: ${
          noteRootSerialized ? (noteRootSerialized as Buffer).toString('hex') : '???'
        } \n
        Block commitment tree size: ${blockNoteSize}\n
        Block commitment: ${
          blockRootSerialized ? (blockRootSerialized as Buffer).toString('hex') : '???'
        }\n`,
    )

    chain.logger.debug(`TREES IN BAD STATE`)
    return false
  }

  if (
    !chain.strategy
      .nullifierHasher()
      .hashSerde()
      .equals(nullifierRoot, heaviestBlock.header.nullifierCommitment.commitment)
  ) {
    const nullifierSize = await chain.nullifiers.size(tx)
    const blockNullifierSize = heaviestBlock.header.nullifierCommitment.size
    chain.logger.error(
      `After adding block ${heaviestBlock.header.hash.toString('hex')} seq ${
        heaviestBlock.header.sequence
      } Nullifier Merkle Tree is in a BAD STATE: \n
      Nullifier tree size: ${nullifierSize} \n
      Block commitment tree size: ${blockNullifierSize}`,
    )
    chain.logger.debug(`TREES IN BAD STATE`)
    return false
  }

  return true
}
