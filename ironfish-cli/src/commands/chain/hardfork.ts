/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Block, IronfishNode, Meter, NodeUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { ProgressBar } from '../../types'
import { rewindChainTo } from './rewind'

const HARD_FORK_HASH = '00000000000006ce61057e714ede8471d15cc9d19f0ff58eee179cadf3ba1f31'
const HARD_FORK_SEQUENCE = 270446

export default class RepairHardFork extends IronfishCommand {
  static description = 'Repairs your blockchain in the case that you are on hardfork 270446'

  static args = [
    {
      name: 'start',
      required: false,
      description: 'The block sequence to start repairing at',
    },
  ]

  static flags = {
    ...LocalFlags,
    dry: Flags.boolean({
      default: false,
      description: 'Dry run repair first',
    }),
    batchSize: Flags.integer({
      default: 1000,
      description: 'How many blocks to load in parallel',
    }),
  }

  async start(): Promise<void> {
    const { args, flags } = await this.parse(RepairHardFork)

    const node = await this.sdk.node()

    const start = args.start
      ? Number(args.start)
      : node.chain.consensus.parameters.genesisBlockSequence

    await NodeUtils.waitForOpen(node)
    await this.rewindChain(node, flags.dry)
    await this.repairNullifiers(node, start, flags.dry, flags.batchSize)
  }

  async repairNullifiers(
    node: IronfishNode,
    start: number,
    dryRun: boolean,
    batchSize: number,
  ): Promise<void> {
    let current = start
    const stop = node.chain.head.sequence

    const header = await node.chain.getHeaderAtSequence(start)
    Assert.isNotNull(header)
    const block = await node.chain.getBlock(header)
    Assert.isNotNull(block)

    const spendCount = Array.from(block.spends()).length
    let nullifierTreeIndex = header.nullifierCommitment.size - spendCount
    let nullifierRepaired = 0

    const processBatch = async (blocks: Block[]): Promise<void> => {
      for (const block of blocks) {
        for (const spend of block.spends()) {
          const contains = await node.chain.nullifiers.contains(spend.nullifier)

          if (!contains) {
            nullifierRepaired++

            this.log(
              `\rMissing nullifier: block ${
                block.header.sequence
              }, index: ${nullifierTreeIndex}: ${spend.nullifier.toString(
                'hex',
              )} (repaired ${nullifierRepaired})${''.padEnd(10, ' ')}`,
            )

            refreshProgressBar()

            const existing = await node.chain.nullifiers.getLeaf(nullifierTreeIndex)
            const merkleHash = node.chain.nullifiers.hasher.merkleHash(spend.nullifier)
            Assert.isTrue(merkleHash.equals(existing.merkleHash))

            if (!dryRun) {
              await node.chain.nullifiers.leavesIndex.put(merkleHash, nullifierTreeIndex)
            }
          }

          speedNullifiers.add(1)
          nullifierTreeIndex++
        }
      }
    }

    const progressBar = CliUx.ux.progress({
      format:
        'Repairing blockchain: [{bar}] {percentage}% | {value} / {total} blocks | {speed}/bps | {speedNullifiers}/nps | ETA: {estimate}',
    }) as ProgressBar

    progressBar.start(stop, current, {
      speed: '0',
      speedNullifiers: '0',
      estimate: TimeUtils.renderEstimate(0, 0, 0),
    })

    const refreshProgressBar = () => {
      progressBar.update(current, {
        speed: speed.rate1m.toFixed(0),
        speedNullifiers: speedNullifiers.rate1m.toFixed(0),
        estimate: TimeUtils.renderEstimate(current, stop, speed.rate1m),
      })
    }

    const speedNullifiers = new Meter()
    speedNullifiers.start()

    const speed = new Meter()
    speed.start()

    const batch = new Array<Promise<Block>>()

    for (let i = current; i <= node.chain.head.sequence; ++i) {
      const promise = node.chain.getHeaderAtSequence(i).then(async (header) => {
        Assert.isNotNull(header)
        const block = await node.chain.getBlock(header)
        Assert.isNotNull(block)
        return block
      })

      batch.push(promise)

      if (batch.length > batchSize) {
        const blocks = await Promise.all(batch)
        await processBatch(blocks)

        speed.add(batch.length)
        current += batch.length
        batch.length = 0

        refreshProgressBar()
      }
    }

    const blocks = await Promise.all(batch)
    await processBatch(blocks)
    speed.add(batch.length)
    current += batch.length
    batch.length = 0

    speed.stop()
    speedNullifiers.stop()
    progressBar.stop()
  }

  async rewindChain(node: IronfishNode, dryRun: boolean): Promise<void> {
    const header = await node.chain.getHeaderAtSequence(HARD_FORK_SEQUENCE)
    if (!header) {
      return
    }

    const hasHardFork = header.hash.toString('hex') === HARD_FORK_HASH
    if (!hasHardFork) {
      return
    }

    this.log(`Your node has a known hard fork at sequence ${HARD_FORK_SEQUENCE}`)
    this.log(`Rewinding your blockchain to before the hard fork.`)

    if (!dryRun) {
      await rewindChainTo(this, node, HARD_FORK_SEQUENCE - 1)
    }
  }
}
