/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, Meter, NodeUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class Rewind extends IronfishCommand {
  static description = 'Rewinds the chain database to the given sequence'

  static args = [
    {
      name: 'sequence',
      parse: (input: string): Promise<number> => Promise.resolve(Number(input.trim())),
      required: true,
    },
  ]

  static flags = {
    ...LocalFlags,
  }

  async start(): Promise<void> {
    const { args } = await this.parse(Rewind)

    const node = await this.sdk.node()

    await NodeUtils.waitForOpen(node)

    const toDisconnect = node.chain.head.sequence - args.sequence

    this.log(
      `Chain head currently at ${node.chain.head.sequence}. Rewinding ${toDisconnect} blocks to ${args.sequence}.`,
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
    while (node.chain.head.sequence > args.sequence) {
      const head = node.chain.head

      const block = await node.chain.getBlock(head)

      Assert.isNotNull(block)

      await node.chain.db.transaction(async (tx) => {
        await node.chain.disconnect(block, tx)
      })

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
