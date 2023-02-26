/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NoteEncryptedHash } from '../../../../primitives/noteEncrypted'
import {
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  PrefixEncoding,
  StringEncoding,
} from '../../../../storage'
import { Account } from '../../../../wallet'
import { AccountValue, AccountValueEncoding } from './AccountValue'
import { DecryptedNoteValue, DecryptedNoteValueEncoding } from './decryptedNoteValue'

export function GetOldStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
  decryptedNotes: IDatabaseStore<{
    key: [Account['prefix'], NoteEncryptedHash]
    value: DecryptedNoteValue
  }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore(
    {
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    false,
  )

  const decryptedNotes: IDatabaseStore<{
    key: [Account['prefix'], NoteEncryptedHash]
    value: DecryptedNoteValue
  }> = db.addStore({
    name: 'd',
    keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
    valueEncoding: new DecryptedNoteValueEncoding(),
  })

  return { accounts, decryptedNotes }
}
