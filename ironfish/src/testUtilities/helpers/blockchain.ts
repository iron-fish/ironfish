/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import '../matchers/blockchain'
import { Account } from '../../account'
import { Assert } from '../../assert'
import { IronfishBlockchain } from '../../blockchain'
import { IronfishNode } from '../../node'
import { Block, IronfishBlock } from '../../primitives/block'
import { BlockHeader } from '../../primitives/blockheader'
import { IronfishBlockHeader } from '../../primitives/blockheader'
import { Target } from '../../primitives/target'
import { GraffitiUtils } from '../../utils/graffiti'
import { useBlockFixture, useMinerBlockFixture } from '../fixtures'

export async function makeBlockAfter(
  chain: IronfishBlockchain,
  after: IronfishBlockHeader | IronfishBlock,
): Promise<IronfishBlock> {
  if (after instanceof Block) {
    after = after.header
  }

  const sequence = after.sequence + 1
  const miningReward = BigInt(chain.strategy.miningReward(sequence))

  if (miningReward !== BigInt(0)) {
    throw new Error(`Must have mining reward disabled but was ${miningReward}`)
  }

  const timestamp = new Date()
  const target = Target.calculateTarget(timestamp, after.timestamp, after.target)
  const randomness = Math.random()
  const graffiti = GraffitiUtils.fromString('fake block')

  const header = new BlockHeader(
    chain.strategy,
    sequence,
    after.hash,
    after.noteCommitment,
    after.nullifierCommitment,
    target,
    randomness,
    timestamp,
    miningReward,
    graffiti,
    BigInt(1),
  )

  const block = new Block(header, [])

  Assert.isUndefined((await chain.verifier.verifyBlock(block)).reason)
  return block
}

/**
 * Adds a block to the chain that gives {@link from} a
 * miners fee, then a transaction on a new block that
 * gives that miners fee to {@link to}, as well as another
 * miners fee for {@link from}.
 *
 * Returned block has 1 spend, 3 notes
 */
export async function makeBlockWithTransaction(
  node: IronfishNode,
  from: Account,
  to: Account,
): Promise<IronfishBlock> {
  const sequence = node.chain.head.sequence

  const block1 = await useMinerBlockFixture(node.chain, sequence + 1, from, node.accounts)

  await expect(node.chain).toAddBlock(block1)
  await node.accounts.updateHead()

  const block2 = await useBlockFixture(node.chain, async () => {
    const transaction = await node.accounts.createTransaction(
      from,
      BigInt(1),
      BigInt(0),
      '',
      to.publicAddress,
    )

    return node.chain.newBlock(
      [transaction],
      await node.chain.strategy.createMinersFee(
        await transaction.transactionFee(),
        sequence + 2,
        from.spendingKey,
      ),
    )
  })

  return block2
}
