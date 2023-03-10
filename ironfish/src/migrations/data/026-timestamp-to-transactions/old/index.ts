/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  PrefixEncoding,
  StringEncoding,
  U64_ENCODING,
} from '../../../../storage'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { TransactionValue, TransactionValueEncoding } from './transactionValue'

export function GetOldStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
  transactions: IDatabaseStore<{ key: [Buffer, Buffer]; value: TransactionValue }>
  timestampToTransactionHash: IDatabaseStore<{
    key: [Buffer, number]
    value: Buffer
  }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore({
    name: 'a',
    keyEncoding: new StringEncoding(),
    valueEncoding: new AccountValueEncoding(),
  })

  const transactions: IDatabaseStore<{
    key: [Buffer, Buffer]
    value: TransactionValue
  }> = db.addStore({
    name: 't',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new TransactionValueEncoding(),
  })

  const timestampToTransactionHash: IDatabaseStore<{ key: [Buffer, number]; value: Buffer }> =
    db.addStore({
      name: 'T',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), U64_ENCODING, 4),
      valueEncoding: new BufferEncoding(),
    })

  return { accounts, transactions, timestampToTransactionHash }
}
