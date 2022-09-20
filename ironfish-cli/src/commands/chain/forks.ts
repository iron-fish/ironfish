/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils } from '@ironfish/sdk'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { GossipForkCounter } from '../../utils/forkCounter'

export default class ForksCommand extends IronfishCommand {
  static description = 'Try to detect forks that are being mined'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    await this.parse(ForksCommand)
    this.logger.pauseLogs()

    let connected = false

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

    const counter = new GossipForkCounter()
    counter.start()

    setInterval(() => {
      status.clearBaseLine(0)
      list.clearBaseLine(0)
      list.setContent('')

      for (const { hash, age, graffiti, mined, sequenceDelta } of counter.forks) {
        list.pushLine(`${hash} | ${sequenceDelta} | ${age}s | ${mined} | ${graffiti}`)
      }
      status.setContent(
        `Node: ${String(connected)}, Forks: ${counter.forksCount.toString().padEnd(2, ' ')}`,
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

      const response = this.sdk.client.onGossipStream()

      for await (const value of response.contentStream()) {
        counter.count(value.blockHeader)
      }
    }
  }
}
