/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getFeeRate, GetMempoolTransactionResponse, MinMax, Transaction } from '@ironfish/sdk'
import { Flags, Interfaces } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { table, TableColumns, TableFlags } from '../../ui'

const { sort: _, ...tableFlags } = TableFlags

const parseMinMax = (input: string): MinMax | undefined => {
  if (input.split(':').length === 1) {
    const parsed = parseInt(input)
    return Number.isNaN(parsed) ? undefined : { min: parsed, max: parsed }
  }

  const values = /^([0-9]*)(:([0-9]*))?$/.exec(input)

  if (!values) {
    return undefined
  }

  const min = ['', undefined].includes(values[1]) ? undefined : parseInt(values[1])
  const max = ['', undefined].includes(values[3]) ? undefined : parseInt(values[3])

  return {
    min,
    max,
  }
}

export class TransactionsCommand extends IronfishCommand {
  static description = `list mempool transactions`

  static flags = {
    ...RemoteFlags,
    ...tableFlags,
    show: Flags.integer({
      default: 30,
      description: 'Number of transactions to display on the console',
    }),
    queryLimit: Flags.integer({
      description: 'Number of transactions to query from the node',
    }),
    feeRate: Flags.string({
      description:
        'Range of values for feeRate given as max:min e.g. `0:5`. A single number indicates equality',
    }),
    fee: Flags.string({
      description:
        'Range of values for fee given as max:min e.g. `0:5`. A single number indicates equality',
    }),
    expiration: Flags.string({
      aliases: ['exp'],
      description:
        'Range of values for expiration sequence given as max:min e.g. `0:5`. A single number indicates equality',
    }),
    position: Flags.string({
      aliases: ['pos'],
      description:
        'Range of values for position in mempool sequence given as max:min e.g. `0:5`. A single number indicates equality',
    }),
    expiresIn: Flags.string({
      aliases: ['expin'],
      description:
        'Range of values for expiration delta from head of chain given as max:min e.g. `0:5`. A single number indicates equality',
    }),
    serializedData: Flags.boolean({
      aliases: ['full'],
      default: false,
      description:
        'Output the entire serialized transaction data. Best used with the --csv flag',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(TransactionsCommand)

    let feeRate: MinMax | undefined
    let fee: MinMax | undefined
    let expiration: MinMax | undefined
    let position: MinMax | undefined
    let expiresIn: MinMax | undefined

    if (flags.feeRate) {
      feeRate = parseMinMax(flags.feeRate)
      if (feeRate === undefined) {
        this.error('unable to parse flag --feeRate')
      }
    }

    if (flags.fee) {
      fee = parseMinMax(flags.fee)
      if (fee === undefined) {
        this.error('unable to parse flag --fee')
      }
    }

    if (flags.expiration) {
      expiration = parseMinMax(flags.expiration)
      if (expiration === undefined) {
        this.error('unable to parse flag --expiration')
      }
    }

    if (flags.position) {
      position = parseMinMax(flags.position)
      if (position === undefined) {
        this.error('unable to parse flag --position')
      }
    }

    if (flags.expiresIn) {
      expiresIn = parseMinMax(flags.expiresIn)
      if (expiresIn === undefined) {
        this.error('unable to parse flag --expiresIn')
      }
    }

    await this.sdk.client.connect()

    const response = this.sdk.client.mempool.getMempoolTransactionsStream({
      limit: flags.queryLimit,
      feeRate,
      fee,
      expiration,
      position,
      expiresIn,
    })

    const transactions: GetMempoolTransactionResponse[] = []
    for await (const transaction of response.contentStream()) {
      if (transactions.length >= flags.limit) {
        break
      }
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
  expiresIn: number
  fee: bigint
  position: number
  serialized: string
}

function renderTable(
  response: GetMempoolTransactionResponse[],
  flags: Interfaces.InferredFlags<typeof TransactionsCommand.flags>,
): string {
  const columns: TableColumns<TransactionRow> = {
    position: {
      header: 'POSITION',
      minWidth: 4,
      get: (row: TransactionRow) => {
        return row.position
      },
    },
    feeRate: {
      header: 'FEE RATE',
      minWidth: 7,
      get: (row: TransactionRow) => {
        return row.feeRate
      },
    },
    expiration: {
      header: 'EXPIRATION',
      get: (row: TransactionRow) => {
        return row.expiration
      },
    },
    expiresIn: {
      header: 'EXPIRES_IN',
      get: (row: TransactionRow) => {
        return row.expiresIn
      },
    },
    fee: {
      header: 'FEE',
      minWidth: 7,
      get: (row: TransactionRow) => {
        return row.fee
      },
    },
    hash: {
      header: 'HASH',
      minWidth: 65,
      get: (row: TransactionRow) => {
        return row.hash
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

  table(getRows(response), columns, {
    printLine: (line) => (result += `${String(line)}\n`),
    ...flags,
  })

  return result
}

function getRows(response: GetMempoolTransactionResponse[]): TransactionRow[] {
  return response.map(({ serializedTransaction, position, expiresIn }) => {
    const transaction = new Transaction(Buffer.from(serializedTransaction, 'hex'))

    return {
      hash: transaction.hash().toString('hex'),
      feeRate: getFeeRate(transaction),
      expiration: transaction.expiration(),
      fee: transaction.fee(),
      expiresIn: expiresIn,
      serialized: serializedTransaction,
      position,
    }
  })
}
