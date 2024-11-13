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
  RpcClient,
  RpcWalletTransaction,
  TransactionType,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { DateFlag, RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { getAssetsByIDs, useAccount } from '../../../utils'
import { extractChainportDataFromTransaction } from '../../../utils/chainport'
import { TableCols, TableOutput } from '../../../utils/table'

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

    const allAccounts = (await client.wallet.getAccounts()).content.accounts

    let accounts = flags.account
    if (flags['no-account']) {
      accounts = allAccounts
    } else if (!accounts) {
      const account = await useAccount(client, undefined)
      accounts = [account]
    }

    const accountsByAddress = new Map<string, string>(
      await Promise.all(
        allAccounts.map<Promise<[string, string]>>(async (account) => {
          const response = await client.wallet.getAccountPublicKey({ account })
          return [response.content.publicKey, response.content.account]
        }),
      ),
    )

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    const transactions = this.getTransactions(
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
    let transactionRows: PartialRecursive<TransactionRow>[] = []

    for await (const { account, transaction } of transactions) {
      if (transactionRows.length >= flags.limit) {
        break
      }

      if (flags['filter.start'] && transaction.timestamp < flags['filter.start'].valueOf()) {
        continue
      }

      if (flags['filter.end'] && transaction.timestamp >= flags['filter.end'].valueOf()) {
        continue
      }

      if (format === 'notes' || format === 'transfers') {
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

        transactionRows = transactionRows.concat(
          this.getTransactionRowsByNote(
            assetLookup,
            accountsByAddress,
            transaction,
            output,
            format,
          ),
        )
      } else {
        const assetLookup = await getAssetsByIDs(
          client,
          transaction.assetBalanceDeltas.map((d) => d.assetId),
          account,
          flags.confirmations,
        )
        transactionRows = transactionRows.concat(
          this.getTransactionRows(assetLookup, transaction, output),
        )
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

  async *getTransactions(
    client: RpcClient,
    accounts: string[],
    hash?: string,
    sequence?: number,
    limit?: number,
    offset?: number,
    confirmations?: number,
    notes?: boolean,
  ): AsyncGenerator<{ account: string; transaction: RpcWalletTransaction }, void> {
    for (const account of accounts) {
      const response = client.wallet.getAccountTransactionsStream({
        account,
        hash: hash,
        sequence: sequence,
        limit: limit,
        offset: offset,
        confirmations: confirmations,
        notes: notes,
      })

      for await (const transaction of response.contentStream()) {
        yield { account, transaction }
      }
    }
  }

  getTransactionRows(
    assetLookup: { [key: string]: RpcAsset },
    transaction: GetAccountTransactionsResponse,
    output: TableOutput,
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
        if (output === TableOutput.cli && amount === 0n && assetCount > 1) {
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
      if (transactionRows.length === 0 || output !== TableOutput.cli) {
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
    accountLookup: Map<string, string>,
    transaction: GetAccountTransactionsResponse,
    output: TableOutput,
    format: 'notes' | 'transactions' | 'transfers',
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
      const senderName = accountLookup.get(note.sender)
      const recipientName = accountLookup.get(note.owner)

      let group = this.getRowGroup(index, noteCount, transactionRows.length)

      if (format === 'transfers') {
        if (note.sender === note.owner && !transaction.mints.length) {
          continue
        } else {
          group = ''
        }
      }

      // include full transaction details in first row or non-cli-formatted output
      if (transactionRows.length === 0 || output !== TableOutput.cli) {
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
          senderName,
          recipient,
          recipientName,
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
          senderName,
          recipient,
          recipientName,
          memo,
        })
      }
    }

    return transactionRows
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
  senderName?: string
  recipient: string
  recipientName?: string
  memo?: string
}
