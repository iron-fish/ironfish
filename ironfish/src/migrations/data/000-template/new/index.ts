/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IDatabase, IDatabaseStore, StringEncoding } from '../../../../storage'
import { AccountValue, AccountValueEncoding } from './AccountValue'

/* GetNewStores must be defined for each migration. It should return a reference
 * to each datastore that the migration modifies.
 */
export function GetNewStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore(
    {
      // You can use a new table name when you are writing a migration
      // if you want, just be sure to delete the old table when you are
      // done.
      name: 'new',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    // you need to pass false if you plan on mounting a table with the same name
    // in both the old and new schema
    false,
  )

  return { accounts }
}
