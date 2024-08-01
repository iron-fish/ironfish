/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Blockchain, BlockchainUtils, FullNode, NodeUtils, Wallet } from '@ironfish/sdk'
import { Args, Command, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { ProgressBar, ProgressBarPresets } from '../../ui'

export default class Rewind extends IronfishCommand {
  static description = 'rewind the blockchain to a block'

  static hidden = true

  static args = {
    to: Args.integer({
      required: true,
      description: 'The block sequence to rewind to',
    }),
    from: Args.integer({
      required: false,
      description: 'The sequence to start removing blocks from',
    }),
  }

  static flags = {
    wallet: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'should the wallet be rewinded',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(Rewind)

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    await rewindChainTo(this, node, flags.wallet, args.to, args.from)
  }
}

export const rewindChainTo = async (
  command: Command,
  node: FullNode,
  rewindWallet: boolean,
  to: number,
  from?: number,
): Promise<void> => {
  const chain = node.chain
  const wallet = node.wallet

  const { start, stop } = BlockchainUtils.getBlockRange(node.chain, {
    start: to,
    stop: from,
  })

  const blockCount = stop - start

  if (blockCount <= 0) {
    command.log(
      `Chain head currently at ${stop}. Cannot rewind to ${start} because it is is greater than the latest sequence in the chain.`,
    )
    command.exit(1)
  }

  command.log(
    `Chain currently has blocks up to ${stop}. Rewinding ${blockCount} blocks to ${start}.`,
  )

  await disconnectBlocks(chain, blockCount)

  if (rewindWallet) {
    await rewindWalletHead(chain, wallet)
  }

  await removeBlocks(chain, start, stop)
}

async function disconnectBlocks(chain: Blockchain, toDisconnect: number): Promise<void> {
  const bar = new ProgressBar('Disconnecting blocks', { preset: ProgressBarPresets.withSpeed })

  bar.start(toDisconnect, 0)

  let disconnected = 0

  while (disconnected < toDisconnect) {
    const headBlock = await chain.getBlock(chain.head)

    Assert.isNotNull(headBlock)

    await chain.blockchainDb.db.transaction(async (tx) => {
      await chain.disconnect(headBlock, tx)
    })

    bar.update(++disconnected)
  }

  bar.stop()
}

async function rewindWalletHead(chain: Blockchain, wallet: Wallet): Promise<void> {
  const walletHead = await wallet.getLatestHead()

  if (!walletHead) {
    return
  }

  if (walletHead.sequence > chain.head.sequence) {
    const total = walletHead.sequence - chain.head.sequence

    const bar = new ProgressBar('Rewinding wallet', { preset: ProgressBarPresets.withSpeed })
    bar.start(total, 0)

    const scan = await wallet.scan({ wait: false })

    if (scan) {
      scan.onTransaction.on((sequence, _, action) => {
        if (action === 'connect') {
          bar.update(total - Math.abs(sequence - chain.head.sequence))
        } else {
          bar.update(total - Math.abs(sequence - 1 - chain.head.sequence))
        }
      })

      await scan.wait()
    }

    bar.stop()
  }
}

async function removeBlocks(
  chain: Blockchain,
  sequence: number,
  fromSequence: number,
): Promise<void> {
  const toRemove = fromSequence - sequence
  const bar = new ProgressBar('Removing blocks', { preset: ProgressBarPresets.withSpeed })

  bar.start(toRemove, 0)

  let removed = 0

  while (fromSequence > sequence) {
    const hashes = await chain.getHashesAtSequence(fromSequence)

    for (const hash of hashes) {
      await chain.removeBlock(hash)
    }

    fromSequence--

    bar.update(++removed)
  }

  bar.stop()
}
