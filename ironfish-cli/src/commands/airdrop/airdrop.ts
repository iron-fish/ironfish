/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { watchTransaction } from '../../utils/transaction'

export class Airdrop extends IronfishCommand {
  static description = `Drop coins to testnet participants`
  static aliases = ['airdrop:airdrop']
  static hidden = true
  static flags = {
    ...LocalFlags,
    posted: Flags.string({
      required: true,
      default: 'posted_transactions.txt',
      description: 'New line separated serialized airdrop transactions',
    }),
  }
  async start(): Promise<void> {
    const { flags } = await this.parse(Airdrop)
    let lineNum = 0
    const fileContent = await fs.readFile(flags.posted, 'utf-8')
    const lines = fileContent.split(/[\r\n]+/)
    const client = await this.sdk.connectRpc()
    for (const line of lines) {
      lineNum++
      CliUx.ux.action.start(`Adding transaction #${lineNum}`)
      const response = await client.wallet.addTransaction({ transaction: line.trim() })
      CliUx.ux.action.stop()
      if (response.content.accepted) {
        this.logger.info(`Added ${response.content.hash} transaction (#${lineNum})`)
        await watchTransaction({
          client,
          logger: this.logger,
          account: response.content.accounts[0],
          hash: response.content.hash,
          confirmations: 0,
        })
      } else {
        this.logger.warn(
          `Skipping ${response.content.hash} transaction (#${lineNum}), transaction was not accepted`,
        )
      }
    }
  }
}
