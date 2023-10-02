/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferUtils, CurrencyUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class TransactionCommand extends IronfishCommand {
  static description = `Display an account transaction`

  static flags = {
    ...RemoteFlags,
  }

  static args = [
    {
      name: 'hash',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: true,
      description: 'Hash of the transaction',
    },
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(TransactionCommand)
    const hash = args.hash as string
    const account = args.account as string | undefined

    const client = await this.sdk.connectRpc()

    const response = await client.wallet.getAccountTransaction({ account, hash })

    if (!response.content.transaction) {
      this.log(`No transaction found by hash ${hash}`)
      return
    }

    this.log(`Transaction: ${hash}`)
    this.log(`Account: ${response.content.account}`)
    this.log(`Status: ${response.content.transaction.status}`)
    this.log(`Type: ${response.content.transaction.type}`)
    this.log(`Timestamp: ${TimeUtils.renderString(response.content.transaction.timestamp)}`)
    this.log(`Fee: ${CurrencyUtils.renderIron(response.content.transaction.fee, true)}`)
    if (response.content.transaction.blockHash && response.content.transaction.blockSequence) {
      this.log(`Block Hash: ${response.content.transaction.blockHash}`)
      this.log(`Block Sequence: ${response.content.transaction.blockSequence}`)
    }
    this.log(`Notes Count: ${response.content.transaction.notesCount}`)
    this.log(`Spends Count: ${response.content.transaction.spendsCount}`)
    this.log(`Mints Count: ${response.content.transaction.mintsCount}`)
    this.log(`Burns Count: ${response.content.transaction.burnsCount}`)
    this.log(`Sender: ${response.content.transaction.notes[0].sender}`)

    if (response.content.transaction.notes.length > 0) {
      this.log(`\n---Notes---\n`)

      CliUx.ux.table(response.content.transaction.notes, {
        amount: {
          header: 'Amount',
          get: (note) => CurrencyUtils.renderIron(note.value),
        },
        assetName: {
          header: 'Asset Name',
          get: (note) => BufferUtils.toHuman(Buffer.from(note.assetName, 'hex')),
        },
        assetId: {
          header: 'Asset Id',
        },
        isSpent: {
          header: 'Spent',
          get: (note) => (!note.owner ? '?' : note.spent ? `✔` : `x`),
        },
        memo: {
          header: 'Memo',
        },
        owner: {
          header: 'Owner Address',
          get: (note) => note.owner,
        },
      })
    }

    if (response.content.transaction.spendsCount > 0) {
      this.log(`\n---Spends---\n`)
      CliUx.ux.table(response.content.transaction.spends, {
        size: {
          header: 'Size',
          get: (spend) => spend.size,
        },
        nullifier: {
          header: 'Nullifier',
          get: (spend) => spend.nullifier,
        },
        commitmment: {
          header: 'Commitment',
          get: (spend) => spend.commitment,
        },
      })
    }

    if (response.content.transaction.assetBalanceDeltas) {
      this.log(`\n---Asset Balance Deltas---\n`)
      CliUx.ux.table(response.content.transaction.assetBalanceDeltas, {
        assetId: {
          header: 'Asset ID',
        },
        delta: {
          header: 'Balance Change',
        },
      })
    }
  }
}
