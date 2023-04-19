/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { isValidPublicAddress } from '@ironfish/rust-nodejs'
import { Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { parseAllocationsFile } from '../../utils/allocations'
import { AIRDROP_NOTES_IN_BLOCK, FEE_ORE_PER_AIRDROP } from './airdrop'

export default class AirdropRawTransactions extends IronfishCommand {
  static aliases = ['airdrop:raw']
  static hidden = true

  static flags = {
    ...LocalFlags,
    account: Flags.string({
      required: true,
      description: 'The name of the account used to create raw transactions',
    }),
    allocations: Flags.string({
      required: true,
      description:
        'A CSV file with the format address,amountInIron,memo containing genesis block allocations',
    }),
    raw: Flags.string({
      required: false,
      default: 'raw_transactions.txt',
      description: 'where to output the raw transactions',
    }),
  }
  async start(): Promise<void> {
    const { flags } = await this.parse(AirdropRawTransactions)
    const account = flags.account
    const client = await this.sdk.connectRpc()

    const csv = await fs.readFile(flags.allocations, 'utf-8')
    const result = parseAllocationsFile(csv)

    if (!result.ok) {
      this.error(result.error)
    }
    const allocations = result.allocations

    const fileHandle = await fs.open(flags.raw, 'w')

    for (let i = 0; i < allocations.length; i += AIRDROP_NOTES_IN_BLOCK) {
      const chunk = allocations.slice(i, i + AIRDROP_NOTES_IN_BLOCK)
      const outputs = []
      for (const output of chunk) {
        if (!isValidPublicAddress(output.publicAddress)) {
          this.warn(
            `Invalid public address ${output.publicAddress} for user: ${output.memo}, skipping`,
          )
          continue
        }
        if (output.amountInOre < 1) {
          this.warn(`Invalid amount ${output.amountInOre} for user: ${output.memo}, skipping`)
          continue
        }

        outputs.push({
          publicAddress: output.publicAddress,
          amount: output.amountInOre.toString(),
          memo: output.memo,
        })
      }

      const result = await client.wallet.createTransactionAirdrop({
        account,
        outputs,
        fee: String(BigInt(AIRDROP_NOTES_IN_BLOCK) * FEE_ORE_PER_AIRDROP),
        confirmations: 0,
        expiration: 100000,
      })

      await fs.appendFile(fileHandle, `${result.content.transaction} + \n`)
    }

    await fileHandle.close()
  }
}
