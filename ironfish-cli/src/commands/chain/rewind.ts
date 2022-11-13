/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Meter, NodeUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class Rewind extends IronfishCommand {
  static description =
    'Rewinds the chain database to the given sequence by deleting all blocks with greater sequences'

  static args = [
    {
      name: 'to',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'The block sequence to rewind to',
    },
    {
      name: 'from',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The sequence to start removing blocks from',
    },
  ]

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(Rewind)

    const sequence = Number(args.to)

    const node = await this.sdk.node()

    await NodeUtils.waitForOpen(node)

    let fromSequence = args.from
      ? Math.max(Number(args.from), node.chain.latest.sequence)
      : node.chain.latest.sequence

    const toDisconnect = fromSequence - sequence

    if (toDisconnect <= 0) {
      this.log(
        `Chain head currently at ${fromSequence}. Cannot rewind to ${sequence} because it is is greater than the latest sequence in the chain.`,
      )
      this.exit(1)
    }

    this.log(
      `Chain currently has blocks up to ${fromSequence}. Rewinding ${toDisconnect} blocks to ${sequence}.`,
    )

    const progressBar = CliUx.ux.progress({
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      format:
        'Rewinding chain: [{bar}] {percentage}% | {value} / {total} blocks | {speed}/s | ETA: {estimate}',
    }) as ProgressBar

    const speed = new Meter()

    progressBar.start(toDisconnect, 0, {
      speed: '0',
      estimate: TimeUtils.renderEstimate(0, 0, 0),
    })
    speed.start()

    let disconnected = 0

    while (fromSequence > sequence) {
      const hashes = await node.chain.getHashesAtSequence(fromSequence)

      for (const hash of hashes) {
        await node.chain.removeBlock(hash)
      }

      fromSequence--

      speed.add(1)
      progressBar.update(++disconnected, {
        speed: speed.rate1s.toFixed(2),
        estimate: TimeUtils.renderEstimate(disconnected, toDisconnect, speed.rate1m),
      })
    }

    speed.stop()
    progressBar.stop()
  }
}
