/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { AsyncUtils, GENESIS_BLOCK_SEQUENCE } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs'
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class Export extends IronfishCommand {
  static description = 'Export part of the chain database to JSON'

  static flags = {
    ...RemoteFlags,
    path: Flags.string({
      char: 'p',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'a path to export the chain to',
    }),
  }

  static args = [
    {
      name: 'start',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      default: Number(GENESIS_BLOCK_SEQUENCE),
      required: false,
      description: 'the sequence to start at (inclusive, genesis block is 1)',
    },
    {
      name: 'stop',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      required: false,
      description: 'the sequence to end at (inclusive)',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Export)
    const path = this.sdk.fileSystem.resolve(
      this.sdk.fileSystem.join(flags.path || this.sdk.config.dataDir, 'data.json'),
    )
    const pathAccessible = await this.sdk.fileSystem
      .access(path)
      .then(() => true)
      .catch(() => false)

    if (!pathAccessible) {
      this.error(`Path "${path}" is not accessible. Check -p argument and try again.`)
    }

    const client = await this.sdk.connectRpc()

    const stream = client.exportChainStream({
      start: args.start as number | null,
      stop: args.stop as number | null,
    })

    const { start, stop } = await AsyncUtils.first(stream.contentStream())
    this.log(`Exporting chain from ${start} -> ${stop} to ${path}`)

    const progress = CliUx.ux.progress({
      format: 'Exporting blocks: [{bar}] {value}/{total} {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    progress.start(stop - start + 1, 0)

    const results: unknown[] = []

    for await (const result of stream.contentStream()) {
      results.push(result.block)
      progress.update(result.block?.seq || 0)
    }

    progress.stop()

    await fs.promises.writeFile(path, JSON.stringify(results, undefined, '  '))
    this.log('Export complete')
  }
}
