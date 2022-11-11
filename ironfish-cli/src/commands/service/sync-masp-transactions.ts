/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiMaspUpload, GetTransactionStreamResponse, WebApi } from '@ironfish/sdk'
import { SyncTransactions } from './sync-transactions'

export default class SyncMaspTransactions extends SyncTransactions<ApiMaspUpload> {
  static aliases = ['service:syncMaspTransactions']

  static description = 'Upload MASP transactions to an HTTP API using IronfishApi'

  upload = (api: WebApi, payload: ApiMaspUpload[]): Promise<void> =>
    api.uploadMaspTransactions(payload)
  async getHead(api: WebApi): Promise<string | null> {
    return await api.headDeposits()
  }

  serialize = (data: GetTransactionStreamResponse): ApiMaspUpload => {
    // Values here for `type` and `assetName` are stubbed until we update the transaction model
    return {
      ...data,
      transactions: data.transactions.map((tx) => ({
        ...tx,
        notes: tx.notes.map((note) => ({
          ...note,
          memo: note.memo,
          type: 'MASP_TRANSFER',
          assetName: 'STUBBED',
        })),
      })),
    }
  }
}
