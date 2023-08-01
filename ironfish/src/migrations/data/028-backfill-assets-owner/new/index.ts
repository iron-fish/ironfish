/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BUFFER_ENCODING, IDatabase, IDatabaseStore } from '../../../../storage'
import { AssetValue, AssetValueEncoding } from './assetValue'

export function GetNewStores(db: IDatabase): {
  assets: IDatabaseStore<{ key: Buffer; value: AssetValue }>
} {
  const assets: IDatabaseStore<{ key: Buffer; value: AssetValue }> = db.addStore(
    {
      name: 'bA',
      keyEncoding: BUFFER_ENCODING,
      valueEncoding: new AssetValueEncoding(),
    },
    false,
  )

  return { assets }
}
