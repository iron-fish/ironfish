/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BigU64BEEncoding,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  NULL_ENCODING,
  PrefixEncoding,
  U32_ENCODING_BE,
} from '../../../../storage'
import { Account } from '../../../../wallet'

export function GetOldStores(db: IDatabase): {
  unspentNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], [Buffer, [number, [bigint, Buffer]]]]
    value: null
  }>
} {
  const unspentNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], [Buffer, [number, [bigint, Buffer]]]]
    value: null
  }> = db.addStore({
    name: 'un',
    keyEncoding: new PrefixEncoding(
      new BufferEncoding(), // account prefix
      new PrefixEncoding(
        new BufferEncoding(), // asset ID
        new PrefixEncoding(
          U32_ENCODING_BE, // sequence
          new PrefixEncoding(
            new BigU64BEEncoding(), // value
            new BufferEncoding(), // note hash
            8,
          ),
          4,
        ),
        32,
      ),
      4,
    ),
    valueEncoding: NULL_ENCODING,
  })

  return { unspentNoteHashes }
}
