/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export default class AirdropPostTransactions extends IronfishCommand {
  static description = `Post transactions for testnet participants`
  static aliases = ['airdrop:post']
  static hidden = true
  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      required: true,
      description: 'The name of the account used to post the transactions',
    }),
    raw: Flags.string({
      required: false,
      default: 'raw_transactions.txt',
      description: 'Input of New line separated raw airdrop transactions',
    }),
    posted: Flags.string({
      required: false,
      default: 'posted_transactions.txt',
      description: 'where to output the posted transactions',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(AirdropPostTransactions)
    const fileContent = await fs.readFile(flags.raw, 'utf-8')
    const lines = fileContent.split(/[\r\n]+/)
    const client = await this.sdk.connectRpc()

    const fileHandle = await fs.open(flags.posted, 'w')

    // Pop final line if empty
    if (lines[lines.length - 1] === '') {
      this.logger.log(`Removing empty line from end of file`)
      lines.pop()
    }

    const promises = []
    for (const [idx, line] of lines.entries()) {
      // Parallelizing posting transactions yields minimal (?) performance gains
      const startTime = Date.now()
      this.logger.log(`posting ${idx + 1} of ${lines.length} transactions`)

      if (line !== '') {
        promises.push(
          client.wallet.postTransaction({
            account: flags.account,
            transaction: line.trim(),
            broadcast: false,
          }),
        )
      }

      // Process 6 transactions at a time because the node has 6 worker threads
      if (promises.length === 6 || idx === lines.length - 1) {
        for (const [promiseIdx, promise] of promises.entries()) {
          const response = await promise

          // Don't add a newline to the last txn
          if (promiseIdx === promises.length - 1 && idx === lines.length - 1) {
            await fs.appendFile(fileHandle, response.content.transaction)
          } else {
            await fs.appendFile(fileHandle, response.content.transaction + `\n`)
          }

          this.logger.log(
            `took ${(Date.now() - startTime) / 1000} s to post txn #${
              idx - (promises.length - promiseIdx)
            }`,
          )
        }
        // Clear the array
        promises.splice(0, promises.length)
      }
    }

    if (promises.length > 0) {
      this.logger.error(`promises array not empty after processing all transactions?`)
    }

    await fileHandle.close()
  }
}
