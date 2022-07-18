/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { AccountsValue, AccountsValueEncoding } from '../../../account/database/accounts'
import { AccountsDBMeta, MetaValueEncoding } from '../../../account/database/meta'
import {
  BUFFER_ENCODING,
  IDatabase,
  StringEncoding,
  StringHashEncoding,
} from '../../../storage'
import { NoteToNullifiersValue, NoteToNullifiersValueEncoding } from './noteToNullifier'
import { TransactionsValue, TransactionsValueEncoding } from './transactions'

export function loadStores(accountsDb: IDatabase) {
  const meta = accountsDb.addStore<{
    key: keyof AccountsDBMeta
    value: AccountsDBMeta[keyof AccountsDBMeta]
  }>({
    name: 'meta',
    keyEncoding: new StringEncoding<keyof AccountsDBMeta>(),
    valueEncoding: new MetaValueEncoding(),
  })

  const accounts = accountsDb.addStore<{ key: string; value: AccountsValue }>({
    name: 'accounts',
    keyEncoding: new StringEncoding(),
    valueEncoding: new AccountsValueEncoding(),
  })

  const noteToNullifier = accountsDb.addStore<{
    key: string
    value: NoteToNullifiersValue
  }>({
    name: 'noteToNullifier',
    keyEncoding: new StringHashEncoding(),
    valueEncoding: new NoteToNullifiersValueEncoding(),
  })

  const nullifierToNote = accountsDb.addStore<{ key: string; value: string }>({
    name: 'nullifierToNote',
    keyEncoding: new StringHashEncoding(),
    valueEncoding: new StringEncoding(),
  })

  const transactions = accountsDb.addStore<{
    key: Buffer
    value: TransactionsValue
  }>({
    name: 'transactions',
    keyEncoding: BUFFER_ENCODING,
    valueEncoding: new TransactionsValueEncoding(),
  })

  return { meta, accounts, noteToNullifier, nullifierToNote, transactions }
}
