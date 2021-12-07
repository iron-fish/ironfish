/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import cli from 'cli-ux'
import {
  AsyncUtils,
  GENESIS_BLOCK_SEQUENCE,
  MathUtils,
  Meter,
  oreToIron,
  TimeUtils,
} from 'ironfish'
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'
import { linkText } from '../../utils/terminal'

export class MinedCommand extends IronfishCommand {
  static description = `List mined block hashes`

  static flags = {
    ...RemoteFlags,
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
    const { args } = this.parse(MinedCommand)
    const client = await this.sdk.connectRpc()

    this.log('Scanning for mined blocks...')

    const stream = client.exportMinedStream({
      start: args.start as number | null,
      stop: args.stop as number | null,
    })

    const { start, stop } = await AsyncUtils.first(stream.contentStream())
    this.log(`Scanning for mined blocks from ${start} -> ${stop}`)

    const speed = new Meter()

    const progress = cli.progress({
      format:
        'Scanning blocks: [{bar}] {value}/{total} {percentage}% | ETA: {estimate} | SEQ {sequence}',
    }) as ProgressBar

    speed.start()
    progress.start(stop - start + 1, 0)

    for await (const { sequence, block } of stream.contentStream()) {
      if (block) {
        process.stdout.clearLine(-1)
        process.stdout.cursorTo(0)

        const amount = MathUtils.round(oreToIron(block.minersFee), 2)

        const link = linkText(
          `https://explorer.ironfish.network/blocks/${block.hash.toUpperCase()}`,
          'view in web',
        )

        this.log(
          `${block.hash} ${block.account} ${amount} ${block.main ? 'MAIN' : 'FORK'} ${
            block.sequence
          }: ${link}`,
        )
      }

      speed.add(1)

      progress.update(sequence - start, {
        estimate: TimeUtils.renderEstimate(sequence - start, stop - start, speed.rate5s),
        sequence,
      })
    }
  }
}
