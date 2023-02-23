/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferEncoding, IDatabase, IDatabaseStore, PrefixEncoding } from '../../../../storage'

export function GetNewStores(db: IDatabase): {
  nullifierToTransactionHash: IDatabaseStore<{
    key: [Buffer, Buffer]
    value: Buffer
  }>
} {
  const nullifierToTransactionHash: IDatabaseStore<{ key: [Buffer, Buffer]; value: Buffer }> =
    db.addStore({
      name: 'nt',
      keyEncoding: new PrefixEncoding(new BufferEncoding(), new BufferEncoding(), 4),
      valueEncoding: new BufferEncoding(),
    })

  return { nullifierToTransactionHash }
}
