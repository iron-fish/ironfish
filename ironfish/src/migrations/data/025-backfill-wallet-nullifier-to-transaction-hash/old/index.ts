/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  PrefixEncoding,
  StringEncoding,
} from '../../../../storage'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { HeadValue, NullableHeadValueEncoding } from './headValue'
import { TransactionValue, TransactionValueEncoding } from './transactionValue'

export function GetOldStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
  heads: IDatabaseStore<{ key: string; value: HeadValue | null }>
  transactions: IDatabaseStore<{ key: [Buffer, Buffer]; value: TransactionValue }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore({
    name: 'a',
    keyEncoding: new StringEncoding(),
    valueEncoding: new AccountValueEncoding(),
  })

  const heads: IDatabaseStore<{
    key: string
    value: HeadValue | null
  }> = db.addStore({
    name: 'h',
    keyEncoding: new StringEncoding(),
    valueEncoding: new NullableHeadValueEncoding(),
  })

  const transactions: IDatabaseStore<{
    key: [Buffer, Buffer]
    value: TransactionValue
  }> = db.addStore({
    name: 't',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new TransactionValueEncoding(),
  })

  return { accounts, heads, transactions }
}
