/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  allAccountsByAddress,
  Assert,
  CurrencyUtils,
  getTransactionsWithAssets,
  PartialRecursive,
  TransactionType,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { DateFlag, RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { useAccount } from '../../../utils'
import { extractChainportDataFromTransaction } from '../../../utils/chainport'
import { TableCols, TableOutput } from '../../../utils/table'
import {
  getTransactionRows,
  getTransactionRowsByNote,
  TransactionAssetRow,
  TransactionNoteRow,
} from './transactionExportUtils'

const { sort: _, ...tableFlags } = ui.TableFlags

export class TransactionsCommand extends IronfishCommand {
  static description = `list the account's transactions`

  static examples = [
    {
      description: 'List all transactions in the current wallet:',
      command: '$ <%= config.bin %> <%= command.id %>',
    },
    {
      description:
        'Export transactions in all wallets for the month of october in an accounting friendly format:',
      command:
        '$ <%= config.bin %> <%= command.id %> --no-account --filter.start 2024-10-01 --filter.end 2024-11-01 --output csv --format transfers',
    },
  ]

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    account: Flags.string({
      char: 'a',
      multiple: true,
      description: 'show transactions from this account',
    }),
    'no-account': Flags.boolean({
      description: 'show transactions for all accounts',
      exclusive: ['account'],
      aliases: ['no-a'],
    }),
    transaction: Flags.string({
      char: 't',
      aliases: ['hash'],
      description: 'Transaction hash to get details for',
    }),
    sequence: Flags.integer({
      char: 's',
      description: 'Block sequence to get transactions for',
    }),
    offset: Flags.integer({
      description: 'Number of latest transactions to skip',
    }),
    confirmations: Flags.integer({
      description: 'Number of block confirmations needed to confirm a transaction',
    }),
    notes: Flags.boolean({
      description: 'Include data from transaction output notes',
    }),
    format: Flags.string({
      description: 'show the data in a specified view',
      exclusive: ['notes'],
      options: ['notes', 'transactions', 'transfers'],
      helpGroup: 'OUTPUT',
    }),
    'filter.start': DateFlag({
      description: 'include transactions after this date (inclusive). Example: 2023-04-01',
    }),
    'filter.end': DateFlag({
      description: 'include transactions before this date (exclusive). Example: 2023-05-01',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionsCommand)

    const output: TableOutput =
      flags.csv || flags.output === 'csv'
        ? TableOutput.csv
        : flags.output === 'json'
        ? TableOutput.json
        : TableOutput.cli

    const format =
      flags.notes || flags.format === 'notes'
        ? 'notes'
        : flags.format === 'transactions'
        ? 'transactions'
        : flags.format === 'transfers'
        ? 'transfers'
        : 'transfers'

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const accountsByAddress = await allAccountsByAddress(client)
    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    let accounts = flags.account
    if (flags['no-account']) {
      accounts = [...accountsByAddress.keys()]
    } else if (!accounts) {
      const account = await useAccount(client, undefined)
      accounts = [account]
    }

    const transactions = getTransactionsWithAssets(
      client,
      accounts,
      flags.transaction,
      flags.sequence,
      flags.limit,
      flags.offset,
      flags.confirmations,
      format === 'notes' || format === 'transfers',
    )

    let hasTransactions = false
    const transactionRows: PartialRecursive<TransactionRow>[] = []

    for await (const { transaction, assetLookup } of transactions) {
      if (transactionRows.length >= flags.limit) {
        break
      }

      if (flags['filter.start'] && transaction.timestamp < flags['filter.start'].valueOf()) {
        continue
      }

      if (flags['filter.end'] && transaction.timestamp >= flags['filter.end'].valueOf()) {
        continue
      }

      let transactionSubRows: TransactionNoteRow[] | TransactionAssetRow[]
      if (format === 'notes' || format === 'transfers') {
        transactionSubRows = getTransactionRowsByNote(
          assetLookup,
          accountsByAddress,
          transaction,
          format,
        )
      } else {
        transactionSubRows = getTransactionRows(assetLookup, transaction)

        // exclude the native asset in cli output if no amount was sent/received
        // and it was not the only asset exchanged
        if (output === TableOutput.cli && transactionSubRows.length > 1) {
          transactionSubRows = transactionSubRows.filter(({ assetId, amount }) => {
            return assetId !== Asset.nativeId().toString('hex') || amount !== 0n
          })
        }
      }

      const feePaid = transaction.type === TransactionType.SEND ? BigInt(transaction.fee) : 0n
      let transactionType: string = transaction.type
      if (extractChainportDataFromTransaction(networkId, transaction)) {
        transactionType =
          transaction.type === TransactionType.SEND ? 'Bridge (outgoing)' : 'Bridge (incoming)'
      }

      for (const [index, subRow] of transactionSubRows.entries()) {
        const group =
          format === 'transfers' ? '' : this.getRowGroup(index, transactionSubRows.length)

        const addTransaction = index === 0 || output !== TableOutput.cli
        const fullTransactionInfo = { ...transaction, feePaid, type: transactionType }

        transactionRows.push({
          ...(addTransaction ? fullTransactionInfo : {}),
          ...subRow,
          group,
        })
      }
      hasTransactions = true
    }

    const columns = this.getColumns(flags.extended, format, output)

    ui.table(transactionRows, columns, {
      printLine: this.log.bind(this),
      ...flags,
    })

    if (!hasTransactions) {
      this.log('No transactions found')
    }
  }

  getColumns(
    extended: boolean,
    output: 'notes' | 'transactions' | 'transfers',
    format: TableOutput,
  ): ui.TableColumns<PartialRecursive<TransactionRow>> {
    let columns: ui.TableColumns<PartialRecursive<TransactionRow>> = {
      timestamp: TableCols.timestamp({
        streaming: true,
      }),
      status: {
        header: 'Status',
        minWidth: 12,
        get: (row) => row.status ?? '',
      },
      type: {
        header: 'Type',
        minWidth: output === 'notes' || output === 'transfers' ? 18 : 8,
        get: (row) => row.type ?? '',
      },
      hash: {
        header: 'Hash',
        minWidth: 32,
        get: (row) => row.hash ?? '',
      },
      notesCount: {
        header: 'Notes',
        minWidth: 5,
        extended: true,
        get: (row) => row.notesCount ?? '',
      },
      spendsCount: {
        header: 'Spends',
        minWidth: 5,
        extended: true,
        get: (row) => row.spendsCount ?? '',
      },
      mintsCount: {
        header: 'Mints',
        minWidth: 5,
        extended: true,
        get: (row) => row.mintsCount ?? '',
      },
      burnsCount: {
        header: 'Burns',
        minWidth: 5,
        extended: true,
        get: (row) => row.burnsCount ?? '',
      },
      expiration: {
        header: 'Expiration',
        get: (row) => row.expiration ?? '',
      },
      submittedSequence: {
        header: 'Submitted Sequence',
        get: (row) => row.submittedSequence ?? '',
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

    if (output === 'notes' || output === 'transfers') {
      columns = {
        ...columns,
        senderName: {
          header: 'Sender',
          get: (row) => row.senderName ?? '',
        },
        sender: {
          header: 'Sender Address',
          get: (row) => row.sender ?? '',
        },
        recipientName: {
          header: 'Recipient',
          get: (row) => row.recipientName ?? '',
        },
        recipient: {
          header: 'Recipient Address',
          get: (row) => row.recipient ?? '',
        },
        memo: {
          header: 'Memo',
          get: (row) => row.memo ?? '',
        },
      }
    }

    if (format === TableOutput.cli) {
      columns = {
        group: {
          header: '',
          minWidth: 3,
          get: (row) => row.group ?? '',
        },
        ...columns,
      }
    }

    return columns
  }

  getRowGroup(index: number, total: number): string {
    if (total <= 1) {
      return ''
    }

    if (index === 0) {
      return '┏'
    } else if (index === total - 1) {
      return '┗'
    } else {
      return '┣'
    }
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
  senderName?: string
  recipient: string
  recipientName?: string
  memo?: string
}
