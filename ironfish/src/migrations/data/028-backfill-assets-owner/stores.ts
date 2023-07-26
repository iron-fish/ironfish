/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IDatabase } from '../../../storage'
import { GetNewStores } from './new'
import { GetOldStores } from './old'

export function GetStores(db: IDatabase): {
  old: ReturnType<typeof GetOldStores>
  new: ReturnType<typeof GetNewStores>
} {
  const oldStores = GetOldStores(db)
  const newStores = GetNewStores(db)

  return { old: oldStores, new: newStores }
}
