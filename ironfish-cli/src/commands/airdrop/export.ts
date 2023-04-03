/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class AirdropExport extends IronfishCommand {
  static description = `airdrop:export`
  static aliases = ['airdrop:export']
  static hidden = true
  static flags = {
    ...LocalFlags,
    account: Flags.string({
      required: true,
      description: 'The name of the account to use for keys to assign the genesis block to',
    }),
    exported: Flags.string({
      required: false,
      default: 'exported_airdrop.sql',
      description: 'where to output the posted transactions',
    }),
  }
  async start(): Promise<void> {
    const { flags } = await this.parse(AirdropExport)
    const account = flags.account
    const client = await this.sdk.connectRpc()

    const response = client.getAccountTransactionsStream({
      account,
    })
    await fs.rm(flags.exported)
    const fileHandle = await fs.open(flags.exported, 'a')
    for await (const transaction of response.contentStream()) {
      const fullTransaction = await client.getAccountTransaction({
        account,
        hash: transaction.hash,
      })
      const notes = fullTransaction.content.transaction?.notes
      if (!notes) {
        continue
      }
      for (const note of notes) {
        await fs.appendFile(
          fileHandle,
          `update redemptions set transaction_hash='${transaction.hash}', sent_ore=${note.value}  where user_id = (SELECT id from users where graffiti = '${note.memo}');\n`,
        )
      }
    }
    await fileHandle.close()
  }
}
