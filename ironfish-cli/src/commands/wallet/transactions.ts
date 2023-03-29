/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  CurrencyUtils,
  GetAccountTransactionsResponse,
  PartialRecursive,
  TransactionType,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { TableCols } from '../../utils/table'

export class TransactionsCommand extends IronfishCommand {
  static description = `Display the account transactions`

  static flags = {
    ...RemoteFlags,
    ...CliUx.ux.table.flags(),
    hash: Flags.string({
      char: 't',
      description: 'Transaction hash to get details for',
    }),
    limit: Flags.integer({
      description: 'Number of latest transactions to get details for',
    }),
    offset: Flags.integer({
      description: 'Number of latest transactions to skip',
    }),
    confirmations: Flags.integer({
      description: 'Number of block confirmations needed to confirm a transaction',
    }),
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionsCommand)
    const account = args.account as string | undefined

    const formatted = flags.csv !== true && flags.output === undefined

    const client = await this.sdk.connectRpc()
    const response = client.getAccountTransactionsStream({
      account,
      hash: flags.hash,
      limit: flags.limit,
      offset: flags.offset,
      confirmations: flags.confirmations,
    })

    const columns = this.getColumns(flags.extended, formatted)

    let showHeader = !flags['no-header']

    for await (const transaction of response.contentStream()) {
      const transactionRows = this.getTransactionRows(transaction, formatted)

      CliUx.ux.table(transactionRows, columns, {
        printLine: this.log.bind(this),
        ...flags,
        'no-header': !showHeader,
      })

      showHeader = false
    }
  }

  getTransactionRows(
    transaction: GetAccountTransactionsResponse,
    formatted: boolean,
  ): PartialRecursive<TransactionRow>[] {
    const nativeAssetId = Asset.nativeId().toString('hex')

    const assetBalanceDeltas = transaction.assetBalanceDeltas.sort((d) =>
      d.assetId === nativeAssetId ? -1 : 1,
    )

    const feePaid = transaction.type === TransactionType.SEND ? BigInt(transaction.fee) : 0n

    const transactionRows = []

    let assetCount = assetBalanceDeltas.length

    for (const [index, { assetId, assetName, delta }] of assetBalanceDeltas.entries()) {
      let amount = BigInt(delta)

      if (assetId === Asset.nativeId().toString('hex')) {
        if (transaction.type === TransactionType.SEND) {
          amount += feePaid
        }

        // exclude the native asset in formatted output if no amount was sent/received
        if (formatted && amount === 0n) {
          assetCount -= 1
          continue
        }
      }

      const group = this.getRowGroup(index, assetCount, transactionRows.length)

      // include full transaction details in first row or non-formatted output
      if (transactionRows.length === 0 || !formatted) {
        transactionRows.push({
          ...transaction,
          group,
          assetId,
          assetName,
          amount,
          feePaid,
        })
      } else {
        transactionRows.push({
          group,
          assetId,
          assetName,
          amount,
        })
      }
    }

    return transactionRows
  }

  getColumns(
    extended: boolean,
    formatted: boolean,
  ): CliUx.Table.table.Columns<PartialRecursive<TransactionRow>> {
    const columns: CliUx.Table.table.Columns<PartialRecursive<TransactionRow>> = {
      timestamp: TableCols.timestamp({
        streaming: true,
      }),
      status: {
        header: 'Status',
        minWidth: 12,
      },
      type: {
        header: 'Type',
        minWidth: 8,
      },
      hash: {
        header: 'Hash',
        minWidth: 32,
      },
      notesCount: {
        header: 'Notes',
        minWidth: 5,
        extended: true,
      },
      spendsCount: {
        header: 'Spends',
        minWidth: 5,
        extended: true,
      },
      mintsCount: {
        header: 'Mints',
        minWidth: 5,
        extended: true,
      },
      burnsCount: {
        header: 'Burns',
        minWidth: 5,
        extended: true,
      },
      expiration: {
        header: 'Expiration',
      },
      feePaid: {
        header: 'Fee Paid ($IRON)',
        get: (row) =>
          row.feePaid && row.feePaid !== 0n ? CurrencyUtils.renderIron(row.feePaid) : '',
      },
      ...TableCols.asset({ extended, formatted }),
      amount: {
        header: 'Net Amount',
        get: (row) => {
          Assert.isNotUndefined(row.amount)
          return CurrencyUtils.renderIron(row.amount)
        },
        minWidth: 16,
      },
    }

    if (formatted) {
      return {
        group: {
          header: '',
          minWidth: 3,
        },
        ...columns,
      }
    }

    return columns
  }

  getRowGroup(index: number, assetCount: number, assetRowCount: number): string {
    if (assetCount > 1) {
      if (assetRowCount === 0) {
        return '┏'
      } else if (assetRowCount > 0 && index < assetCount - 1) {
        return '┣'
      } else if (assetRowCount > 0 && index === assetCount - 1) {
        return '┗'
      }
    }

    return ''
  }
}

type TransactionRow = {
  group?: string
  timestamp: number
  status: string
  type: string
  hash: string
  assetId: string
  assetName: string
  amount: bigint
  feePaid?: bigint
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
}
