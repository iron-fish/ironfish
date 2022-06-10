/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { oreToIron } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class TransactionsCommand extends IronfishCommand {
  static description = `Display the account transactions`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'a',
      description: 'account transactions',
    }),
    hash: Flags.string({
      char: 't',
      description: 'details of transaction hash',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionsCommand)
    const account = flags.account?.trim()
    const hash = flags.hash?.trim()

    if (hash) {
      await this.getTransaction(account, hash)
    } else {
      await this.getTransactions(account)
    }
  }

  async getTransaction(account: string | undefined, hash: string): Promise<void> {
    const client = await this.sdk.connectRpc()

    const response = await client.getAccountTransaction({ account, hash })

    const {
      account: accountResponse,
      transactionHash,
      transactionInfo,
      transactionNotes,
    } = response.content

    this.log(`Account: ${accountResponse}`)

    if (transactionInfo !== null) {
      this.log(
        `Transaction: ${transactionHash}\nStatus: ${transactionInfo.status}\nMiner Fee: ${
          transactionInfo.isMinersFee ? `✔` : `x`
        }\nFee ($ORE): ${transactionInfo.fee}\nSpends: ${transactionInfo.spends}\n`,
      )
    }

    if (transactionNotes.length > 0) {
      this.log(`---Notes---\n`)

      CliUx.ux.table(transactionNotes, {
        isSpender: {
          header: 'Spender',
          get: (row) => (row.spender ? `✔` : `x`),
        },
        amount: {
          header: 'Amount ($IRON)',
          get: (row) => oreToIron(row.amount),
        },
        memo: {
          header: 'Memo',
        },
      })
    }

    this.log(`\n`)
  }

  async getTransactions(account: string | undefined): Promise<void> {
    const client = await this.sdk.connectRpc()

    const response = await client.getAccountTransactions({ account })

    const { account: accountResponse, transactions } = response.content

    this.log(`\n ${String(accountResponse)} - Account transactions\n`)

    CliUx.ux.table(transactions, {
      status: {
        header: 'Status',
      },
      creator: {
        header: 'Creator',
        get: (row) => (row.creator ? `✔` : `x`),
      },
      hash: {
        header: 'Hash',
      },
      isMinersFee: {
        header: 'Miner Fee',
        get: (row) => (row.isMinersFee ? `✔` : `x`),
      },
      fee: {
        header: 'Fee ($ORE)',
        get: (row) => row.fee,
      },
      notes: {
        header: 'Notes',
      },
      spends: {
        header: 'Spends',
      },
    })

    this.log(`\n`)
  }
}
