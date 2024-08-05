/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils, PromiseUtils } from '@ironfish/sdk'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { GossipForkCounter } from '../../utils/gossipForkCounter'

export default class ForksCommand extends IronfishCommand {
  static description = 'show forks that are being mined'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    await this.parse(ForksCommand)
    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true })
    screen.focusNext()

    screen.key('q', () => {
      screen.destroy()
      process.exit(0)
    })

    const status = blessed.text({
      parent: screen,
      content: 'STATUS:',
    })

    const list = blessed.textbox({
      top: 1,
      alwaysScroll: true,
      scrollable: true,
      parent: screen,
    })

    const footer = blessed.text({
      bottom: 0,
      content: 'Press Q to quit',
    })

    await this.sdk.client.connect()

    const targetBlockTimeInSeconds = (await this.sdk.client.chain.getConsensusParameters())
      .content.targetBlockTimeInSeconds

    const counter = new GossipForkCounter(targetBlockTimeInSeconds)
    counter.start()

    let connected = false

    setInterval(() => {
      status.clearBaseLine(0)
      list.clearBaseLine(0)
      list.setContent('')

      const latest = counter.latest
      const latestSequence = latest ? latest.header.sequence : 0

      for (const { header, ageSequence, age } of counter.forks) {
        const renderedAge = (age / 1000).toFixed(0).padStart(3)
        const renderedDiff = (latestSequence - header.sequence).toString().padStart(6)
        const renderedAgeSequence = ageSequence.toString().padStart(3)
        const renderedGraffiti = BufferUtils.toHuman(Buffer.from(header.graffiti, 'hex'))

        list.pushLine(
          `${header.hash} | ${renderedDiff} | ${renderedAge}s | ${renderedAgeSequence} | ${renderedGraffiti}`,
        )
      }
      status.setContent(
        `Node: ${String(connected)}, Forks: ${counter.count.toString().padEnd(2, ' ')}`,
      )

      screen.append(footer)

      screen.render()
    }, 1000)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      connected = await this.sdk.client.tryConnect()

      if (!connected) {
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.event.onGossipStream()

      for await (const value of response.contentStream()) {
        counter.add(value.blockHeader)
      }
    }
  }
}
