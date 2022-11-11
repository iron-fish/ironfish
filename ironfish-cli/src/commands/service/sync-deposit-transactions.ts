/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiDepositUpload, GetTransactionStreamResponse, WebApi } from '@ironfish/sdk'
import { SyncTransactions } from './sync-transactions'

export default class SyncMaspTransactions extends SyncTransactions<ApiDepositUpload> {
  static aliases = ['service:syncTransactions']

  static description = 'Upload deposit transactions to an HTTP API using IronfishApi'

  upload = (api: WebApi, payload: ApiDepositUpload[]): Promise<void> =>
    api.uploadDeposits(payload)
  getHead = (api: WebApi): Promise<string | null> => api.headDeposits()

  serialize = (data: GetTransactionStreamResponse): ApiDepositUpload => {
    // Values here for `type` and `assetName` are stubbed until we update the transaction model
    return {
      ...data,
      transactions: data.transactions.map((tx) => ({
        ...tx,
        notes: tx.notes.map((note) => ({
          ...note,
          memo: note.memo,
          amount: Number(note.amount),
        })),
      })),
    }
  }
}
