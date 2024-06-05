/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  Assert,
  CurrencyUtils,
  GetAccountTransactionsResponse,
  PartialRecursive,
  RpcAsset,
  TransactionType,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { getAssetsByIDs } from '../../utils'
import { extractChainportDataFromTransaction } from '../../utils/chainport'
import { Format, TableCols, TableFlags } from '../../utils/table'

const { sort: _, ...tableFlags } = TableFlags
export class TransactionsCommand extends IronfishCommand {
  static description = `Display the account transactions`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to get transactions for',
    }),
    hash: Flags.string({
      char: 't',
      description: 'Transaction hash to get details for',
    }),
    sequence: Flags.integer({
      char: 's',
      description: 'Block sequence to get transactions for',
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
    notes: Flags.boolean({
      default: false,
      description: 'Include data from transaction output notes',
    }),
  }

  static args = [
    {
      name: 'account',
      required: false,
      description: 'Name of the account. DEPRECATED: use --account flag',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(TransactionsCommand)
    // TODO: remove account arg
    const account = flags.account ? flags.account : (args.account as string | undefined)

    const format: Format =
      flags.csv || flags.output === 'csv'
        ? Format.csv
        : flags.output === 'json'
        ? Format.json
        : flags.output === 'yaml'
        ? Format.yaml
        : Format.cli

    const client = await this.sdk.connectRpc()
    const response = client.wallet.getAccountTransactionsStream({
      account,
      hash: flags.hash,
      sequence: flags.sequence,
      limit: flags.limit,
      offset: flags.offset,
      confirmations: flags.confirmations,
      notes: flags.notes,
    })
    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    const columns = this.getColumns(flags.extended, flags.notes, format)

    let showHeader = !flags['no-header']
    let hasTransactions = false

    for await (const transaction of response.contentStream()) {
      let transactionRows: PartialRecursive<TransactionRow>[]
      if (flags.notes) {
        Assert.isNotUndefined(transaction.notes)
        const assetLookup = await getAssetsByIDs(
          client,
          transaction.notes.map((n) => n.assetId) || [],
          account,
          flags.confirmations,
        )

        if (extractChainportDataFromTransaction(networkId, transaction)) {
          transaction.type =
            transaction.type === TransactionType.SEND
              ? ('Bridge (outgoing)' as TransactionType)
              : ('Bridge (incoming)' as TransactionType)
        }

        transactionRows = this.getTransactionRowsByNote(assetLookup, transaction, format)
      } else {
        const assetLookup = await getAssetsByIDs(
          client,
          transaction.assetBalanceDeltas.map((d) => d.assetId),
          account,
          flags.confirmations,
        )
        transactionRows = this.getTransactionRows(assetLookup, transaction, format)
      }

      ux.table(transactionRows, columns, {
        printLine: this.log.bind(this),
        ...flags,
        'no-header': !showHeader,
      })

      showHeader = false
      hasTransactions = true
    }

    if (!hasTransactions) {
      this.log('No transactions found')
    }
  }

  getTransactionRows(
    assetLookup: { [key: string]: RpcAsset },
    transaction: GetAccountTransactionsResponse,
    format: Format,
  ): PartialRecursive<TransactionRow>[] {
    const nativeAssetId = Asset.nativeId().toString('hex')

    const assetBalanceDeltas = transaction.assetBalanceDeltas.sort((d) =>
      d.assetId === nativeAssetId ? -1 : 1,
    )

    const feePaid = transaction.type === TransactionType.SEND ? BigInt(transaction.fee) : 0n

    const transactionRows = []

    let assetCount = assetBalanceDeltas.length

    for (const [index, { assetId, delta }] of assetBalanceDeltas.entries()) {
      const asset = assetLookup[assetId]
      let amount = BigInt(delta)

      if (assetId === Asset.nativeId().toString('hex')) {
        if (transaction.type === TransactionType.SEND) {
          amount += feePaid
        }

        // exclude the native asset in cli output if no amount was sent/received
        // and it was not the only asset exchanged
        if (format === Format.cli && amount === 0n && assetCount > 1) {
          assetCount -= 1
          continue
        }
      }

      const group = this.getRowGroup(index, assetCount, transactionRows.length)

      const transactionRow = {
        group,
        assetId,
        assetName: asset.name,
        amount,
        assetDecimals: asset.verification.decimals,
        assetSymbol: asset.verification.symbol,
      }

      // include full transaction details in first row or non-cli-formatted output
      if (transactionRows.length === 0 || format !== Format.cli) {
        transactionRows.push({
          ...transaction,
          ...transactionRow,
          feePaid,
        })
      } else {
        transactionRows.push(transactionRow)
      }
    }

    return transactionRows
  }

  getTransactionRowsByNote(
    assetLookup: { [key: string]: RpcAsset },
    transaction: GetAccountTransactionsResponse,
    format: Format,
  ): PartialRecursive<TransactionRow>[] {
    Assert.isNotUndefined(transaction.notes)
    const transactionRows = []

    const nativeAssetId = Asset.nativeId().toString('hex')

    const notes = transaction.notes.sort((n) => (n.assetId === nativeAssetId ? -1 : 1))

    const noteCount = transaction.notes.length

    const feePaid = transaction.type === TransactionType.SEND ? BigInt(transaction.fee) : 0n

    for (const [index, note] of notes.entries()) {
      const amount = BigInt(note.value)
      const assetId = note.assetId
      const assetName = assetLookup[note.assetId].name
      const assetDecimals = assetLookup[note.assetId].verification.decimals
      const assetSymbol = assetLookup[note.assetId].verification.symbol
      const sender = note.sender
      const recipient = note.owner
      const memo = note.memo

      const group = this.getRowGroup(index, noteCount, transactionRows.length)

      // include full transaction details in first row or non-cli-formatted output
      if (transactionRows.length === 0 || format !== Format.cli) {
        transactionRows.push({
          ...transaction,
          group,
          assetId,
          assetName,
          assetDecimals,
          assetSymbol,
          amount,
          feePaid,
          sender,
          recipient,
          memo,
        })
      } else {
        transactionRows.push({
          group,
          assetId,
          assetName,
          assetDecimals,
          assetSymbol,
          amount,
          sender,
          recipient,
          memo,
        })
      }
    }

    return transactionRows
  }

  getColumns(
    extended: boolean,
    notes: boolean,
    format: Format,
  ): ux.Table.table.Columns<PartialRecursive<TransactionRow>> {
    let columns: ux.Table.table.Columns<PartialRecursive<TransactionRow>> = {
      timestamp: TableCols.timestamp({
        streaming: true,
      }),
      status: {
        header: 'Status',
        minWidth: 12,
      },
      type: {
        header: 'Type',
        minWidth: notes ? 18 : 8,
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
      submittedSequence: {
        header: 'Submitted Sequence',
      },
      feePaid: {
        header: 'Fee Paid ($IRON)',
        get: (row) =>
          row.feePaid && row.feePaid !== 0n ? CurrencyUtils.render(row.feePaid) : '',
      },
      ...TableCols.asset({ extended, format }),
      amount: {
        header: 'Amount',
        get: (row) => {
          Assert.isNotUndefined(row.amount)
          return CurrencyUtils.render(row.amount, false, row.assetId, {
            decimals: row.assetDecimals,
            symbol: row.assetSymbol,
          })
        },
        minWidth: 16,
      },
    }

    if (notes) {
      columns = {
        ...columns,
        sender: {
          header: 'Sender Address',
        },
        recipient: {
          header: 'Recipient Address',
        },
        memo: {
          header: 'Memo',
        },
      }
    }

    if (format === Format.cli) {
      columns = {
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
  assetDecimals?: number
  assetSymbol?: string
  amount: bigint
  feePaid?: bigint
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  submittedSequence: number
  sender: string
  recipient: string
}
