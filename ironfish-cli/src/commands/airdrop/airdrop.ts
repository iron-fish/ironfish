/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CliUx, Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { watchTransaction } from '../../utils/transaction'

export const AIRDROP_NOTES_IN_BLOCK = 600
export const FEE_ORE_PER_AIRDROP = 10n

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
    const fileContent = await fs.readFile(flags.posted, 'utf-8')
    const lines = fileContent.split(/[\r\n]+/)

    this.logger.log(`Posting ${lines.length} transactions`)

    if (lines[lines.length - 1] === '') {
      this.logger.log(`Removing empty line from end of file`)
      lines.pop()
    }
    const client = await this.sdk.connectRpc()
    for (const [idx, line] of lines.entries()) {
      if (line === '') {
        this.logger.log(`skipping empty line #${idx + 1} of ${lines.length} transactions`)
        continue
      }

      CliUx.ux.action.start(`Adding transaction #${idx + 1}`)
      const response = await client.wallet.addTransaction({ transaction: line.trim() })
      this.logger.log(JSON.stringify(response.content))

      CliUx.ux.action.stop()
      if (response.content.accepted) {
        this.logger.info(`Added ${response.content.hash} transaction (#${idx + 1})`)
        await watchTransaction({
          client,
          logger: this.logger,
          account: response.content.accounts[0],
          hash: response.content.hash,
          confirmations: 0,
        })
      } else {
        this.logger.warn(
          `Skipping ${response.content.hash} transaction (#${
            idx + 1
          }), transaction was not accepted`,
        )
      }
    }
  }
}
