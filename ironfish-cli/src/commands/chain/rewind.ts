/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Blockchain, FullNode, NodeUtils, Wallet } from '@ironfish/sdk'
import { Args, Command } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { ProgressBar, ProgressBarPresets } from '../../ui'

export default class Rewind extends IronfishCommand {
  static description = 'rewind the blockchain to a block'

  static hidden = true

  static args = {
    to: Args.string({
      required: true,
      description: 'The block sequence to rewind to',
    }),
    from: Args.string({
      required: false,
      description: 'The sequence to start removing blocks from',
    }),
  }

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(Rewind)

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    await rewindChainTo(this, node, Number(args.to), Number(args.from))
  }
}

export const rewindChainTo = async (
  command: Command,
  node: FullNode,
  to: number,
  from?: number,
): Promise<void> => {
  const chain = node.chain
  const wallet = node.wallet

  const sequence = to

  const fromSequence = from ? Math.max(from, chain.latest.sequence) : chain.latest.sequence

  const toDisconnect = fromSequence - sequence

  if (toDisconnect <= 0) {
    command.log(
      `Chain head currently at ${fromSequence}. Cannot rewind to ${sequence} because it is is greater than the latest sequence in the chain.`,
    )
    command.exit(1)
  }

  command.log(
    `Chain currently has blocks up to ${fromSequence}. Rewinding ${toDisconnect} blocks to ${sequence}.`,
  )

  await disconnectBlocks(chain, toDisconnect)

  await rewindWalletHead(chain, wallet, sequence)

  await removeBlocks(chain, sequence, fromSequence)
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

async function rewindWalletHead(
  chain: Blockchain,
  wallet: Wallet,
  sequence: number,
): Promise<void> {
  const latestHead = await wallet.getLatestHead()

  if (latestHead) {
    const walletHead = await chain.getHeader(latestHead.hash)

    if (walletHead && walletHead.sequence > sequence) {
      const bar = new ProgressBar('Rewinding wallet', { preset: ProgressBarPresets.withSpeed })

      const toRewind = walletHead.sequence - sequence
      let rewound = 0

      bar.start(toRewind, 0)

      const scan = await wallet.scan({ wait: false })

      if (scan) {
        scan.onTransaction.on((_) => {
          bar.update(++rewound)
        })
      }

      bar.stop()
    }
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
