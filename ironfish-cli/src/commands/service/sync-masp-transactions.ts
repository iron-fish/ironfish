/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiMaspUpload, GetTransactionStreamResponse, WebApi } from '@ironfish/sdk'
import { assert } from 'console'
import { SyncTransactions } from './sync-transactions'

export default class SyncMaspTransactions extends SyncTransactions {
  static aliases = ['service:syncMaspTransactions']

  static description = 'Upload MASP transactions to an HTTP API using IronfishApi'

  async commit(api: WebApi, buffer: Array<GetTransactionStreamResponse>): Promise<void> {
    const serialized = buffer.map(serializeMasp)
    buffer.length = 0
    await api.uploadMaspTransactions(serialized)
  }

  async getHead(api: WebApi): Promise<string | null> {
    return await api.headDeposits()
  }
}

function serializeMasp(data: GetTransactionStreamResponse): ApiMaspUpload {
  return {
    ...data,
    transactions: data.transactions.map((tx) => ({
      ...tx,
      notes: tx.notes
        .filter((i): i is number => {
          return typeof i === 'number'
        })
        .map((note) => ({
          ...note,
          memo: note.memo,
          type: note.type,
          assetName: note.assetName,
        })),
    })),
  }
}
