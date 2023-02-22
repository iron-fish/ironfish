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

    const client = await this.sdk.connectRpc()
    const response = client.getAccountTransactionsStream({
      account,
      hash: flags.hash,
      limit: flags.limit,
      offset: flags.offset,
      confirmations: flags.confirmations,
    })

    const columns = this.getColumns(flags.extended)

    let showHeader = !flags['no-header']

    for await (const transaction of response.contentStream()) {
      const transactionRows = this.getTransactionRows(transaction)

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
  ): PartialRecursive<TransactionRow>[] {
    const nativeAssetId = Asset.nativeId().toString('hex')

    const nativeAssetBalanceDelta = transaction.assetBalanceDeltas.find(
      (d) => d.assetId === nativeAssetId,
    )

    let amount = BigInt(nativeAssetBalanceDelta?.delta ?? '0')

    let feePaid = BigInt(transaction.fee)

    if (transaction.type !== TransactionType.SEND) {
      feePaid = 0n
    } else {
      amount += feePaid
    }

    const transactionRows = []

    const assetCount = transaction.assetBalanceDeltas.length
    const isGroup = assetCount > 1

    // $IRON should appear first if it is the only asset in the transaction or the net amount was non-zero
    if (!isGroup || amount !== 0n) {
      transactionRows.push({
        ...transaction,
        group: isGroup ? '┏' : '',
        assetId: nativeAssetId,
        assetName: Buffer.from('$IRON').toString('hex'),
        amount,
        feePaid,
      })
    }

    for (const [
      index,
      { assetId, assetName, delta },
    ] of transaction.assetBalanceDeltas.entries()) {
      // skip the native asset, added above
      if (assetId === Asset.nativeId().toString('hex')) {
        continue
      }

      if (transactionRows.length === 0) {
        // include full transaction details if the native asset had no net change
        transactionRows.push({
          ...transaction,
          group: assetCount === 2 ? '' : '┏',
          assetId,
          assetName,
          amount: BigInt(delta),
          feePaid,
        })
      } else {
        transactionRows.push({
          group: index === assetCount - 1 ? '┗' : '┣',
          assetId,
          assetName,
          amount: BigInt(delta),
        })
      }
    }

    return transactionRows
  }

  getColumns(extended: boolean): CliUx.Table.table.Columns<PartialRecursive<TransactionRow>> {
    return {
      group: {
        header: '',
        minWidth: 3,
      },
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
      ...TableCols.asset({ extended }),
      amount: {
        header: 'Net Amount',
        get: (row) => {
          Assert.isNotUndefined(row.amount)
          return CurrencyUtils.renderIron(row.amount)
        },
        minWidth: 16,
      },
    }
  }
}

type TransactionRow = {
  group: string
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
