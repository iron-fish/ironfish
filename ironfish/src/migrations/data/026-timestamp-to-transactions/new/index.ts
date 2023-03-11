/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  NULL_ENCODING,
  PrefixEncoding,
  U64_ENCODING,
} from '../../../../storage'

export function GetNewStores(db: IDatabase): {
  timestampToTransactionHash: IDatabaseStore<{
    key: [Buffer, [number, Buffer]]
    value: null
  }>
} {
  const timestampToTransactionHash: IDatabaseStore<{
    key: [Buffer, [number, Buffer]]
    value: null
  }> = db.addStore({
    name: 'TT',
    keyEncoding: new PrefixEncoding(
      new BufferEncoding(),
      new PrefixEncoding(U64_ENCODING, new BufferEncoding(), 8),
      4,
    ),
    valueEncoding: NULL_ENCODING,
  })

  return { timestampToTransactionHash }
}
