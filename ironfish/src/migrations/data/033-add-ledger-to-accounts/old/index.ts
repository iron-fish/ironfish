/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IDatabase, IDatabaseStore, StringEncoding } from '../../../../storage'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { MasterKeyValue, MasterKeyValueEncoding } from './masterKeyValue'

export function GetOldStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
  masterKey: IDatabaseStore<{ key: string; value: MasterKeyValue }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore(
    {
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    false,
  )

  const masterKey: IDatabaseStore<{ key: string; value: MasterKeyValue }> = db.addStore(
    {
      name: 'mk',
      keyEncoding: new StringEncoding<'key'>(),
      valueEncoding: new MasterKeyValueEncoding(),
    },
    false,
  )

  return { accounts, masterKey }
}
