/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BenchUtils, IronfishSdk, NodeUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import blessed from 'blessed'
import fs from 'fs/promises'
import path from 'path'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { IronfishCliPKG } from '../../package'

export default class Benchmark extends IronfishCommand {
  static aliases = ['chain:benchmark']

  static description =
    'Test the performance of the chain by re-importing data from an existing chain'

  static hidden = true

  static flags = {
    ...LocalFlags,
    targetdir: Flags.string({
      char: 't',
      parse: (input: string) => Promise.resolve(input.trim()),
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

  static args = []

  async start(): Promise<void> {
    const { flags } = await this.parse(Benchmark)
    const { blocks } = flags

    CliUx.ux.action.start(`Opening node`)
    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    CliUx.ux.action.stop('done.')

    let targetDirectory
    if (!flags.targetdir) {
      await fs.mkdir(node.config.tempDir, { recursive: true })
      targetDirectory = path.join(node.config.tempDir)
    } else {
      targetDirectory = path.join(flags.targetdir)
    }

    CliUx.ux.action.start(`Opening node in ${targetDirectory}`)

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
    CliUx.ux.action.stop('done.')

    const startingSequence = tempNode.chain.head.sequence
    const startingHeader = await node.chain.getHeaderAtSequence(startingSequence)

    const endingSequence = startingSequence + blocks
    const endingHeader = await node.chain.getHeaderAtSequence(endingSequence)

    if (startingHeader === null) {
      throw new Error(`Target chain is longer than source chain`)
    }

    if (endingHeader === null) {
      throw new Error(`Chain must have at least ${blocks} blocks`)
    }

    if (!tempNode.chain.head.hash.equals(startingHeader?.hash)) {
      throw new Error(`The two chains do not match at sequence ${startingSequence}`)
    }

    let totalMs = 0
    let totalSpends = 0
    let totalNotes = 0
    let totalTransactions = 0

    const screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    const statusText = blessed.text()
    screen.append(statusText)

    for await (const currentHeader of node.chain.iterateTo(startingHeader, endingHeader)) {
      const block = await node.chain.getBlock(currentHeader)
      if (block === null) {
        throw new Error('Should have block if we have header')
      }
      const startTime = BenchUtils.start()
      await tempNode.chain.addBlock(block)
      totalMs += BenchUtils.end(startTime)
      totalSpends += block.transactions.reduce((count, tx) => {
        return count + [...tx.spends()].length
      }, 0)
      totalNotes += block.transactions.reduce((count, tx) => {
        return count + [...tx.notes()].length
      }, 0)
      totalTransactions += block.transactions.length

      if (block.header.sequence % 5 === 0) {
        const status = [
          `Block: ${block.header.sequence.toString()}`,
          `Blocks/sec: ${blocks / (totalMs / 1000)} `,
          `Transactions/sec ${totalTransactions / (totalMs / 1000)} `,
          `Spends/sec: ${totalSpends / (totalMs / 1000)} `,
          `Notes/sec: ${totalNotes / (totalMs / 1000)} `,
        ].join('\n')

        statusText.setContent(status)
        screen.render()
      }
    }

    screen.destroy()

    this.log(`Total time to import ${blocks} blocks: ${TimeUtils.renderSpan(totalMs)}`)
    this.log(`Average ${blocks / (totalMs / 1000)} blocks/sec`)
    this.log(`Average ${totalTransactions / (totalMs / 1000)} transactions/sec`)
    this.log(`Average ${totalSpends / (totalMs / 1000)} spends/sec`)

    // Check that data is consistent
    const nodeNotesHash = await node.chain.notes.pastRoot(endingHeader.noteCommitment.size)
    const tempNodeNotesHash = await tempNode.chain.notes.rootHash()
    if (!nodeNotesHash.equals(tempNodeNotesHash)) {
      throw new Error('/!\\ Note tree hashes were not consistent /!\\')
    }

    const nodeNullifiersHash = await node.chain.nullifiers.pastRoot(
      endingHeader.nullifierCommitment.size,
    )
    const tempNodeNullifiersHash = await tempNode.chain.nullifiers.rootHash()
    if (!nodeNullifiersHash.equals(tempNodeNullifiersHash)) {
      throw new Error('/!\\ Nullifier tree hashes were not consistent /!\\')
    }

    // Clean up the temporary node
    await tempNode.shutdown()
    if (!flags.targetdir) {
      await fs.rm(targetDirectory, { recursive: true })
    }
  }
}
