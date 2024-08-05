/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AsyncUtils, GENESIS_BLOCK_SEQUENCE } from '@ironfish/sdk'
import { Args, Flags } from '@oclif/core'
import fs from 'fs'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../ui'

export default class Export extends IronfishCommand {
  static description = 'export the blockchain to a file'

  static args = {
    start: Args.integer({
      default: Number(GENESIS_BLOCK_SEQUENCE),
      required: false,
      description: 'The sequence to start at (inclusive, genesis block is 1)',
    }),
    stop: Args.integer({
      required: false,
      description: 'The sequence to end at (inclusive)',
    }),
  }

  static flags = {
    ...RemoteFlags,
    path: Flags.string({
      char: 'p',
      required: false,
      description: 'The path to export the chain to',
    }),
  }

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Export)

    const exportDir = flags.path
      ? this.sdk.fileSystem.resolve(flags.path)
      : this.sdk.config.dataDir

    const exportPath = this.sdk.fileSystem.join(exportDir, 'data.json')

    const client = await this.connectRpc()

    const stream = client.chain.exportChainStream({
      start: args.start,
      stop: args.stop,
    })

    const { start, stop } = await AsyncUtils.first(stream.contentStream())
    this.log(`Exporting chain from ${start} -> ${stop} to ${exportPath}`)

    const progress = new ProgressBar('Exporting blocks')

    progress.start(stop - start + 1, 0)

    const results: unknown[] = []

    for await (const result of stream.contentStream()) {
      results.push(result.block)
      progress.update((result.block?.sequence || 0) - start + 1)
    }

    progress.stop()

    await this.sdk.fileSystem.mkdir(exportDir, { recursive: true })

    await fs.promises.writeFile(exportPath, JSON.stringify(results, undefined, '  '))
    this.log('Export complete')
  }
}
