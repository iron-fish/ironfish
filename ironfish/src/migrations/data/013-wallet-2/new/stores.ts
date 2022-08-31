/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BigIntLEEncoding,
  BUFFER_ENCODING,
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
  const meta: MetaStore = db.addStore(
    {
      name: 'meta',
      keyEncoding: new StringEncoding<keyof AccountsDBMeta>(),
      valueEncoding: new MetaValueEncoding(),
    },
    false,
  )

  const headHashes: HeadHashesStore = db.addStore(
    {
      name: 'headHashes',
      keyEncoding: new StringEncoding(),
      valueEncoding: new NullableBufferEncoding(),
    },
    false,
  )

  const accounts: AccountsStore = db.addStore<{ key: string; value: AccountValue }>(
    {
      name: 'accounts',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    false,
  )

  const balances: BalancesStore = db.addStore<{ key: string; value: bigint }>(
    {
      name: 'balances',
      keyEncoding: new StringEncoding(),
      valueEncoding: new BigIntLEEncoding(),
    },
    false,
  )

  const decryptedNotes: DecryptedNotesStore = db.addStore(
    {
      name: 'decryptedNotes',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new DecryptedNoteValueEncoding(),
    },
    false,
  )

  const nullifierToNoteHash: NullifierToNoteHashStore = db.addStore(
    {
      name: 'nullifierToNoteHash',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new BufferEncoding(),
    },
    false,
  )

  const transactions: TransactionsStore = db.addStore(
    {
      name: 'transactions',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new TransactionValueEncoding(),
    },
    false,
  )

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
