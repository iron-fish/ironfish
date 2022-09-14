/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BigIntLEEncoding,
  BufferEncoding,
  IDatabase,
  NullableBufferEncoding,
  PrefixEncoding,
  StringEncoding,
} from '../../../../storage'
import { AccountsStore, AccountValue, AccountValueEncoding } from './accounts'
import { BalancesStore } from './balances'
import { DecryptedNotesStore, DecryptedNoteValueEncoding } from './decryptedNotes'
import { HeadHashesStore } from './headHashes'
import { AccountsDBMeta, MetaStore, MetaValueEncoding } from './meta'
import { NullifierToNoteHashStore } from './nullifierToNoteHash'
import { TransactionsStore, TransactionValueEncoding } from './transactions'

export type NewStores = {
  meta: MetaStore
  accounts: AccountsStore
  nullifierToNoteHash: NullifierToNoteHashStore
  transactions: TransactionsStore
  headHashes: HeadHashesStore
  decryptedNotes: DecryptedNotesStore
  balances: BalancesStore
}

export function loadNewStores(db: IDatabase): NewStores {
  const meta: MetaStore = db.addStore({
    name: 'm',
    keyEncoding: new StringEncoding<keyof AccountsDBMeta>(),
    valueEncoding: new MetaValueEncoding(),
  })

  const headHashes: HeadHashesStore = db.addStore({
    name: 'h',
    keyEncoding: new StringEncoding(),
    valueEncoding: new NullableBufferEncoding(),
  })

  const accounts: AccountsStore = db.addStore<{ key: string; value: AccountValue }>({
    name: 'a',
    keyEncoding: new StringEncoding(),
    valueEncoding: new AccountValueEncoding(),
  })

  const balances: BalancesStore = db.addStore<{ key: string; value: bigint }>({
    name: 'b',
    keyEncoding: new StringEncoding(),
    valueEncoding: new BigIntLEEncoding(),
  })

  const decryptedNotes: DecryptedNotesStore = db.addStore({
    name: 'd',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new DecryptedNoteValueEncoding(),
  })

  const nullifierToNoteHash: NullifierToNoteHashStore = db.addStore({
    name: 'n',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new BufferEncoding(),
  })

  const transactions: TransactionsStore = db.addStore({
    name: 't',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new TransactionValueEncoding(),
  })

  return {
    meta,
    decryptedNotes,
    headHashes,
    balances,
    nullifierToNoteHash,
    accounts,
    transactions,
  }
}
