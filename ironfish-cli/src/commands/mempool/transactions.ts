/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getFeeRate, GetMempoolTransactionResponse, Transaction } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { CommandFlags } from '../../types'

const tableFlags = CliUx.ux.table.flags()

export class TransactionsCommand extends IronfishCommand {
  static description = `List transactions in the mempool`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    limit: Flags.integer({
      default: 30,
      description: 'Number of transactions to display on the console',
    }),
    queryLimit: Flags.integer({
      description: 'Number of transactions to query from the node',
    }),
    minFeeRate: Flags.integer({
      description: 'Only return transactions with a higher feeRate',
    }),
    maxFeeRate: Flags.integer({
      description: 'Only return transactions with a lower feeRate',
    }),
    minFee: Flags.integer({
      description: 'Only return transactions with a higher fee',
    }),
    maxFee: Flags.integer({
      description: 'Only return transactions with a lower fee',
    }),
    minExpiration: Flags.integer({
      description: 'Only return transactions with a later expiration sequence',
    }),
    maxExpiration: Flags.integer({
      description: 'Only return for transactions with a earlier expiration sequence',
    }),
    minPosition: Flags.integer({
      description: 'Only return transactions with a higher position in the mempool queue',
    }),
    maxPosition: Flags.integer({
      description: 'Only return transactions with a lower position in the mempool queue',
    }),
    serializedData: Flags.boolean({
      default: false,
      description:
        'Output the entire serialized transaction data. Best used with the --csv flag',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionsCommand)

    const request = {
      limit: flags.queryLimit,
      feeRate: {
        min: flags.minFeeRate,
        max: flags.maxFeeRate,
      },
      fee: {
        min: flags.minFee,
        max: flags.maxFee,
      },
      expiration: {
        min: flags.minExpiration,
        max: flags.maxExpiration,
      },
      position: {
        min: flags.minPosition,
        max: flags.maxPosition,
      },
    }

    await this.sdk.client.connect()

    const response = this.sdk.client.getMempoolTransactionsStream(request)

    const transactions: GetMempoolTransactionResponse[] = []
    for await (const transaction of response.contentStream()) {
      transactions.push(transaction)
    }

    this.log(renderTable(transactions, flags))
    this.exit(0)
  }
}

type TransactionRow = {
  hash: string
  feeRate: bigint
  expiration: number
  fee: bigint
  position: number
  serialized: string
}

function renderTable(
  response: GetMempoolTransactionResponse[],
  flags: CommandFlags<typeof TransactionsCommand>,
): string {
  const columns: CliUx.Table.table.Columns<TransactionRow> = {
    hash: {
      header: 'HASH',
      minWidth: 65,
      get: (row: TransactionRow) => {
        return row.hash
      },
    },
    feeRate: {
      header: 'FEE RATE',
      minWidth: 7,
      get: (row: TransactionRow) => {
        return row.feeRate
      },
    },
    exipration: {
      header: 'EXPIRATION',
      get: (row: TransactionRow) => {
        return row.expiration
      },
    },
    fee: {
      header: 'FEE',
      minWidth: 7,
      get: (row: TransactionRow) => {
        return row.fee
      },
    },
  }

  if (flags.serializedData) {
    columns['serialized'] = {
      header: 'SERIALIZED',
      minWidth: 2,
      get: (row: TransactionRow) => {
        return row.serialized
      },
    }
  }

  let result = ''

  CliUx.ux.table(getRows(response, flags.limit), columns, {
    printLine: (line) => (result += `${String(line)}\n`),
    ...flags,
  })

  return result
}

function getRows(response: GetMempoolTransactionResponse[], limit: number): TransactionRow[] {
  const transactions = limit > 0 ? response.slice(0, limit) : response
  return transactions.map(({ serializedTransaction, position }) => {
    const transaction = new Transaction(Buffer.from(serializedTransaction, 'hex'))

    return {
      hash: transaction.hash().toString('hex'),
      feeRate: getFeeRate(transaction),
      expiration: transaction.expiration(),
      fee: transaction.fee(),
      serialized: serializedTransaction,
      position,
    }
  })
}
