/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  displayIronAmountWithCurrency,
  GetAccountStatusResponse,
  oreToIron,
  PromiseUtils,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class AccountsStatus extends IronfishCommand {
  static description = `Show the status of Ironfish accounts`

  static flags = {
    ...RemoteFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'follow the status of the node live',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'name of the account to get status for',
    },
  ]

  async start(): Promise<void> {
    const { args, flags } = await this.parse(AccountsStatus)
    const account = args.account as string | undefined

    if (!flags.follow) {
      const client = await this.sdk.connectRpc()
      const response = await client.accountStatus({ account })
      this.log(renderStatus(response.content))
      this.exit(0)
    }

    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    const statusText = blessed.text()
    screen.append(statusText)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const connected = await this.sdk.client.tryConnect()

      if (!connected) {
        statusText.clearBaseLine(0)
        statusText.setContent('Node stopped')
        screen.render()
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.accountStatusStream({ account: account, stream: true })

      for await (const value of response.contentStream()) {
        statusText.clearBaseLine(0)
        statusText.setContent(renderStatus(value))
        screen.render()
      }
    }
  }
}

function renderStatus(content: GetAccountStatusResponse): string {
  const { endSequence, sequence } = content.scanStatus
  let scanStatus
  if (endSequence === -1) {
    scanStatus = 'Scan completed'
  } else {
    scanStatus = `Scanning: ${sequence} / ${endSequence} (${(
      (sequence * 100) /
      endSequence
    ).toFixed(1)}%)`
  }
  return `
Account:              ${content.account}
The balance is:       ${displayIronAmountWithCurrency(
    oreToIron(Number(content.unconfirmed)),
    true,
  )}
Confirmed Balance:    ${displayIronAmountWithCurrency(
    oreToIron(Number(content.confirmed)),
    true,
  )}
Scan Status:          ${scanStatus}`
}
