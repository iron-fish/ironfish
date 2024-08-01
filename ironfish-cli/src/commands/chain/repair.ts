/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, BlockHeader, FullNode, IDatabaseTransaction, TimeUtils } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { confirmOrQuit, ProgressBar, ProgressBarPresets } from '../../ui'

const TREE_BATCH = 1000
const TREE_START = 1
const TREE_END: number | null = null

// I just took the repair speed I get and reduced it by 20%
const SPEED_ESTIMATE = 42

export default class RepairChain extends IronfishCommand {
  static description = 'Rebuild the main chain to fix corruption'

  static hidden = true

  static flags = {
    confirm: Flags.boolean({
      char: 'c',
      default: false,
      description: 'Force confirmation to repair',
    }),
    force: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Force merkle tree reconstruction',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(RepairChain)

    const progress = new ProgressBar('', { preset: ProgressBarPresets.withSpeed })

    ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await node.openDB()
    await node.chain.open()
    ux.action.stop('done.')

    if (node.chain.isEmpty) {
      this.log(`Chain is too corrupt. Delete your DB at ${node.config.chainDatabasePath}`)
      this.exit(0)
    }

    Assert.isNotNull(node.chain.head)
    const total = Number(node.chain.head.sequence)
    const estimate = TimeUtils.renderEstimate(0, total, SPEED_ESTIMATE)

    await confirmOrQuit(
      `⚠️ If you start repairing your database, you MUST finish the` +
        `\nprocess or your database will be in a corrupt state. Repairing` +
        `\nmay take ${estimate} or longer.` +
        `\n\nAre you sure?`,
      flags.confirm,
    )

    await this.repairChain(node, progress)
    await this.repairTrees(node, progress, flags.force)

    this.log('Repair complete.')
  }

  async repairChain(node: FullNode, progress: ProgressBar): Promise<void> {
    Assert.isNotNull(node.chain.head)

    ux.action.start('Clearing hash to next hash table')
    await node.chain.clearHashToNextHash()
    ux.action.stop()

    ux.action.start('Clearing Sequence to hash table')
    await node.chain.clearSequenceToHash()
    ux.action.stop()

    const total = Number(node.chain.head.sequence)
    let done = 0
    let head: BlockHeader | null = node.chain.head

    progress.start(total, 0, {
      title: 'Repairing head chain tables',
    })

    while (head && head.sequence > BigInt(0)) {
      await node.chain.putSequenceToHash(head.sequence, head.hash)
      await node.chain.putNextHash(head.previousBlockHash, head.hash)

      head = await node.chain.getHeader(head.previousBlockHash)

      progress.update(++done)
    }

    progress.stop()
  }

  async repairTrees(node: FullNode, progress: ProgressBar, force: boolean): Promise<void> {
    Assert.isNotNull(node.chain.head)

    const noNotes = (await node.chain.notes.size()) === 0
    const noNullifiers = (await node.chain.nullifiers.size()) === 0
    const headBlock = await node.chain.getBlock(node.chain.head)
    Assert.isNotNull(headBlock)
    const treeStatus = await node.chain.verifier.verifyConnectedBlock(headBlock)
    const rebuildTrees = force || noNotes || noNullifiers || !treeStatus.valid

    if (!rebuildTrees) {
      this.log('Skipping repair of merkle trees because it looks like they are valid.')
      this.log('If you want to force them to be repaired, use --force.')
      return
    }

    this.log('\nRepairing MerkleTrees')

    const total = TREE_END ? TREE_END - TREE_START : Number(node.chain.head.sequence)
    let done = 0

    let tx: IDatabaseTransaction | null = null
    let header = await node.chain.getHeaderAtSequence(TREE_START)
    let block = header ? await node.chain.getBlock(header) : null
    let prev = await node.chain.getHeaderAtSequence(TREE_START - 1)
    const noteSize = prev && prev.noteSize !== null ? prev.noteSize : 0

    ux.action.start('Clearing notes MerkleTree')
    await node.chain.notes.truncate(noteSize)
    ux.action.stop()

    ux.action.start('Clearing nullifier set')
    await node.chain.nullifiers.clear()

    ux.action.stop()

    progress.resetMeter()
    progress.start(total, TREE_START, {
      title: 'Reconstructing merkle trees',
    })

    while (block) {
      if (tx === null) {
        tx = node.chain.blockchainDb.db.transaction()
      }

      await node.chain.saveConnect(block, prev || null, tx)

      const verify = await node.chain.verifier.verifyConnectedBlock(block, tx)

      if (!verify.valid) {
        await tx.commit()
        tx = null

        progress.stop()

        const error =
          `\n❗ ERROR adding notes from block` +
          `\nreason: ${String(verify.reason)}` +
          `\nblock:  ${block.header.hash.toString('hex')} (${block.header.sequence})` +
          `\n\nThis means your database is corrupt and needs to be deleted.` +
          `\nDelete your database at ${node.config.chainDatabasePath}\n`

        this.log(error)
        return this.exit(1)
      }

      if (TREE_END !== null && Number(block.header.sequence) >= TREE_END) {
        break
      }

      prev = block.header
      header = await node.chain.getNext(block.header, tx)
      block = header ? await node.chain.getBlock(header, tx) : null

      progress.update(++done)

      if (tx.size > TREE_BATCH) {
        await tx.commit()
        tx = null
      }
    }

    await tx?.commit()
    progress.stop()
  }
}
