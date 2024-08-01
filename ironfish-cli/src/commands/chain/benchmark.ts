/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BenchUtils, IronfishSdk, NodeUtils } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import blessed from 'blessed'
import fs from 'fs/promises'
import path from 'path'
import { IronfishCommand } from '../../command'
import { IronfishCliPKG } from '../../package'
import * as ui from '../../ui'

export default class Benchmark extends IronfishCommand {
  static description =
    'Test the performance of the chain by re-importing data from an existing chain'

  static hidden = true

  static flags = {
    targetdir: Flags.string({
      char: 't',
      required: false,
      description: 'Path to the temporary directory to use to test',
    }),
    blocks: Flags.integer({
      char: 'b',
      required: false,
      default: 1000,
      description: 'Number of blocks to move from one chain to another',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Benchmark)
    const { blocks } = flags

    ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    ux.action.stop('done.')

    let targetDirectory
    if (!flags.targetdir) {
      await fs.mkdir(node.config.tempDir, { recursive: true })
      targetDirectory = path.join(node.config.tempDir)
    } else {
      targetDirectory = path.join(flags.targetdir)
    }

    ux.action.start(`Opening node in ${targetDirectory}`)

    const noLoggingConfig = Object.assign({}, this.sdk.config.overrides)
    noLoggingConfig.logLevel = '*:error'
    const tmpSdk = await IronfishSdk.init({
      pkg: IronfishCliPKG,
      configOverrides: noLoggingConfig,
      configName: undefined,
      dataDir: targetDirectory,
      logger: this.logger,
    })
    const tempNode = await tmpSdk.node()
    await NodeUtils.waitForOpen(tempNode)
    tempNode.workerPool.start()
    ux.action.stop('done.')

    const startingSequence = tempNode.chain.head.sequence
    const startingHeader = await node.chain.getHeaderAtSequence(startingSequence)

    const endingSequence = startingSequence + blocks
    const endingHeader = await node.chain.getHeaderAtSequence(endingSequence)

    if (startingHeader === null) {
      return this.error(`Target chain is longer than source chain`)
    }

    if (endingHeader === null) {
      return this.error(`Chain must have at least ${blocks} blocks`)
    }

    if (!tempNode.chain.head.hash.equals(startingHeader.hash)) {
      return this.error(`The two chains do not match at sequence ${startingSequence}`)
    }

    let totalMs = 0
    let totalBlocks = 0
    let totalTransactions = 0
    let totalSpends = 0
    let totalNotes = 0
    let status = renderStatus(0, 0, 0, 0, 0)

    const screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    const statusText = blessed.text()
    screen.append(statusText)

    statusText.setContent(status)
    screen.render()

    const screenInterval = setInterval(() => {
      statusText.setContent(status)
      screen.render()
    }, 1000)

    for await (const currentHeader of node.chain.iterateTo(startingHeader, endingHeader)) {
      const block = await node.chain.getBlock(currentHeader)
      if (block === null) {
        throw new Error('Should have block if we have header')
      }
      const startTime = BenchUtils.start()
      await tempNode.chain.addBlock(block)

      totalMs += BenchUtils.end(startTime)
      totalBlocks += 1
      totalSpends += block.transactions.reduce((count, tx) => count + tx.spends.length, 0)
      totalNotes += block.transactions.reduce((count, tx) => count + tx.notes.length, 0)
      totalTransactions += block.transactions.length
      status = renderStatus(
        totalMs,
        totalBlocks,
        totalTransactions,
        totalSpends,
        totalNotes,
        block.header.sequence,
      )
    }

    clearInterval(screenInterval)
    screen.destroy()

    this.log('\n' + status)

    // Check that data is consistent
    if (endingHeader.noteSize === null) {
      return this.error(`Header should have a noteSize`)
    }
    const nodeNotesHash = await node.chain.notes.pastRoot(endingHeader.noteSize)
    const tempNodeNotesHash = await tempNode.chain.notes.rootHash()
    if (!nodeNotesHash.equals(tempNodeNotesHash)) {
      throw new Error('/!\\ Note tree hashes were not consistent /!\\')
    }

    // Clean up the temporary node
    await tempNode.shutdown()
    if (!flags.targetdir) {
      this.log(`\nTemporary directory ${targetDirectory} deleted`)
      await fs.rm(targetDirectory, { recursive: true })
    } else {
      this.log(`\n${blocks} blocks added to ${targetDirectory}`)
    }
  }
}

function renderStatus(
  totalMs: number,
  totalBlocks: number,
  totalTransactions: number,
  totalSpends: number,
  totalNotes: number,
  sequence?: number,
): string {
  return ui.card({
    'Current Block': sequence ? sequence.toString() : '-',
    'Blocks Processed': totalBlocks.toString(),
    'Blocks/sec': totalMs ? (totalBlocks / (totalMs / 1000)).toFixed(2) : 0,
    'Transactions/sec': totalMs ? (totalTransactions / (totalMs / 1000)).toFixed(2) : 0,
    'Spends/sec': totalMs ? (totalSpends / (totalMs / 1000)).toFixed(2) : 0,
    'Notes/sec': totalMs ? (totalNotes / (totalMs / 1000)).toFixed(2) : 0,
  })
}
