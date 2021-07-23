/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import fs from 'fs'
import { AsyncUtils, GENESIS_BLOCK_SEQUENCE } from 'ironfish'
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export interface ProgressBar {
  progress: VoidFunction
  getTotal(): number
  setTotal(totalValue: number): void
  start(totalValue?: number, startValue?: number, payload?: Record<string, unknown>): void
  stop: VoidFunction
  update(currentValue?: number, payload?: Record<string, unknown>): void
  update(payload?: Record<string, unknown>): void
  increment(delta?: number, payload?: Record<string, unknown>): void
  increment(payload?: Record<string, unknown>): void
}

export default class Export extends IronfishCommand {
  static description = 'Export part of the chain database to JSON'

  static flags = {
    ...LocalFlags,
    path: flags.string({
      char: 'p',
      parse: (input: string): string => input.trim(),
      required: false,
      default: '../ironfish-graph-explorer/src/data.json',
      description: 'a path to export the chain to',
    }),
  }

  static args = [
    {
      name: 'start',
      parse: parseNumber,
      default: Number(GENESIS_BLOCK_SEQUENCE),
      required: false,
      description: 'the sequence to start at (inclusive, genesis block is 1)',
    },
    {
      name: 'stop',
      parse: parseNumber,
      required: false,
      description: 'the sequence to end at (inclusive)',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = this.parse(Export)
    const path = this.sdk.fileSystem.resolve(flags.path)

    const client = await this.sdk.connectRpc()

    const stream = client.exportChainStream({
      start: args.start as number | null,
      stop: args.stop as number | null,
    })

    const { start, stop } = await AsyncUtils.first(stream.contentStream())
    this.log(`Exporting chain from ${start} -> ${stop} to ${path}`)

    const progress = cli.progress({
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
