/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BenchUtils, IronfishSdk, NodeUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
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
    tempdir: Flags.string({
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

    if (!flags.tempdir) {
      await fs.mkdir(node.config.tempDir, { recursive: true })
      flags.tempdir = node.config.tempDir
    }

    const tempDataDir = await fs.mkdtemp(path.join(flags.tempdir, 'benchmark-'))

    CliUx.ux.action.start(`Opening temp node in ${tempDataDir}`)
    const tmpSdk = await IronfishSdk.init({
      pkg: IronfishCliPKG,
      configOverrides: this.sdk.config.overrides,
      configName: undefined,
      dataDir: tempDataDir,
      logger: this.logger,
    })
    const tempNode = await tmpSdk.node()
    await NodeUtils.waitForOpen(tempNode)
    tempNode.workerPool.start()
    CliUx.ux.action.stop('done.')

    const header = await node.chain.getHeaderAtSequence(blocks)
    if (header === null) {
      return this.error(`Chain must have at least ${blocks} blocks`)
    }

    let totalMs = 0

    for await (const currentHeader of node.chain.iterateTo(node.chain.genesis, header)) {
      const block = await node.chain.getBlock(currentHeader)
      if (block === null) {
        throw new Error('Should have block if we have header')
      }
      const startTime = BenchUtils.start()
      await tempNode.chain.addBlock(block)
      totalMs += BenchUtils.end(startTime)
    }

    this.log(`Total time to import ${blocks} blocks: ${TimeUtils.renderSpan(totalMs)}`)

    // Check that data is consistent
    const nodeNotesHash = await node.chain.notes.pastRoot(header.noteCommitment.size)
    const tempNodeNotesHash = await tempNode.chain.notes.rootHash()
    if (!nodeNotesHash.equals(tempNodeNotesHash)) {
      throw new Error('/!\\ Note tree hashes were not consistent /!\\')
    }

    const nodeNullifiersHash = await node.chain.nullifiers.pastRoot(
      header.nullifierCommitment.size,
    )
    const tempNodeNullifiersHash = await tempNode.chain.nullifiers.rootHash()
    if (!nodeNullifiersHash.equals(tempNodeNullifiersHash)) {
      throw new Error('/!\\ Nullifier tree hashes were not consistent /!\\')
    }

    // Clean up the temporary node
    await tempNode.shutdown()
    await fs.rm(tempDataDir, { recursive: true })
  }
}
