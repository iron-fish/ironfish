/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IDatabase, IDatabaseStore, StringEncoding } from '../../../../storage'
import { AccountValue, AccountValueEncoding } from './AccountValue'

export function GetNewStores(db: IDatabase): {
  accounts: IDatabaseStore<{ key: string; value: AccountValue }>
} {
  const accounts: IDatabaseStore<{ key: string; value: AccountValue }> = db.addStore(
    {
      name: 'a',
      keyEncoding: new StringEncoding(),
      valueEncoding: new AccountValueEncoding(),
    },
    false,
  )

  return { accounts }
}
