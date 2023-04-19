/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Flags } from '@oclif/core'
import fs from 'fs/promises'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { parseAllocationsFile } from '../../utils/allocations'
import { AIRDROP_NOTES_IN_BLOCK, FEE_ORE_PER_AIRDROP } from './airdrop'

export default class AirdropSplit extends IronfishCommand {
  static aliases = ['airdrop:split']
  static hidden = true

  static flags = {
    ...LocalFlags,
    account: Flags.string({
      required: true,
      description: 'The name of the account to use for sending airdrop',
    }),
    allocations: Flags.string({
      required: true,
      description:
        'A CSV file with the format address,amountInOre,memo containing airdrop allocations',
    }),
    output: Flags.string({
      required: false,
      default: 'split_transaction.txt',
      description: 'A serialized raw transaction for splitting originating note',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(AirdropSplit)
    const account = flags.account

    const csv = await fs.readFile(flags.allocations, 'utf-8')
    const result = parseAllocationsFile(csv)

    if (!result.ok) {
      this.error(result.error)
    }
    const client = await this.sdk.connectRpc()
    const publicKey = (await client.wallet.getAccountPublicKey({ account })).content.publicKey
    const allocations = result.allocations

    const outputs = []
    for (let i = 0; i < allocations.length; i += AIRDROP_NOTES_IN_BLOCK) {
      const chunk = allocations.slice(i, i + AIRDROP_NOTES_IN_BLOCK)
      const ore = chunk.reduce(
        (reduceMemo, { amountInOre }) => amountInOre + reduceMemo,
        // base fee for the airdrop notes
        BigInt(AIRDROP_NOTES_IN_BLOCK) * FEE_ORE_PER_AIRDROP,
      )
      outputs.push({
        publicAddress: publicKey,
        amount: ore.toString(),
        memo: '',
      })
    }
    const transaction = await client.wallet.createTransaction({
      account,
      outputs,
      // uses dust from flooring airdrop
      fee: '10',
      expiration: 100000,
    })
    await fs.writeFile(flags.output, transaction.content.transaction)
  }
}
