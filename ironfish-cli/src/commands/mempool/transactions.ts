/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  getFeeRate,
  GetMempoolTransactionsResponse,
  PromiseUtils,
  Transaction,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { CommandFlags } from '../../types'

const tableFlags = CliUx.ux.table.flags()

export class TransactionsCommand extends IronfishCommand {
  static description = `List transactions in the mempool`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    follow: Flags.boolean({
      char: 'f',
      default: false,
      description: 'Follow the transactions list live',
    }),
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

    if (!flags.follow) {
      await this.sdk.client.connect()
      const response = await this.sdk.client.getMempoolTransactions(request)

      this.log(renderTable(response.content, flags))
      this.exit(0)
    }

    // Console log will create display issues with Blessed
    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true, fullUnicode: true })
    const text = blessed.text()
    screen.append(text)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const connected = await this.sdk.client.tryConnect()
      if (!connected) {
        text.clearBaseLine(0)
        text.setContent('Connecting...')
        screen.render()
        await PromiseUtils.sleep(1000)
        continue
      }

      const response = this.sdk.client.getMempoolTransactionsStream(request)

      for await (const value of response.contentStream()) {
        text.clearBaseLine(0)
        text.setContent(renderTable(value, flags))
        screen.render()
      }
    }
  }
}

type TransactionRow = {
  hash: string
  feeRate: bigint
  expiration: number
  fee: bigint
  position: number
}

function renderTable(
  response: GetMempoolTransactionsResponse,
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

  let result = ''

  CliUx.ux.table(getRows(response, flags.limit), columns, {
    printLine: (line) => (result += `${String(line)}\n`),
    ...flags,
  })

  return result
}

function getRows(response: GetMempoolTransactionsResponse, limit: number): TransactionRow[] {
  const transactions = limit > 0 ? response.transactions.slice(0, limit) : response.transactions
  return transactions.map(({ serializedTransaction, position }) => {
    const transaction = new Transaction(Buffer.from(serializedTransaction, 'hex'))

    return {
      hash: transaction.hash().toString('hex'),
      feeRate: getFeeRate(transaction),
      expiration: transaction.expiration(),
      fee: transaction.fee(),
      position,
    }
  })
}
