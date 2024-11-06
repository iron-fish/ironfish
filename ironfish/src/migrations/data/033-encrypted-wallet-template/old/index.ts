/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IDatabase, IDatabaseStore, StringEncoding } from '../../../../storage'
import { AccountValue, AccountValueEncoding } from './accountValue'
import { MasterKeyValue, MasterKeyValueEncoding } from './masterKeyValue'

/* The schemaOld.ts file must define the value schema and database encoding for
 * ALL datastores that the migration reads from. Even if the migration does not
 * modify a datastore _A_, if the migration needs to read data from _A_ in order
 * to write to another datastore _B_, then the schema and encoding for _A_ must
 * be defined in schemaOld.ts.
 *
 * The example below is taken from Migration022, which added the viewKey field
 * to the AccountValue schema. */

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
