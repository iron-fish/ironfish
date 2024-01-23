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
} from '../../../../storage'
import { Account } from '../../../../wallet'

export function GetNewStores(db: IDatabase): {
  valueToUnspentNoteHash: IDatabaseStore<{
    key: [Account['prefix'], [Buffer, [bigint, Buffer]]] // account prefix, asset ID, value, note hash
    value: null
  }>
} {
  const valueToUnspentNoteHash: IDatabaseStore<{
    key: [Account['prefix'], [Buffer, [bigint, Buffer]]] // account prefix, asset ID, value, note hash
    value: null
  }> = db.addStore({
    name: 'valueToUnspentNoteHashes',
    keyEncoding: new PrefixEncoding(
      new BufferEncoding(), // account prefix
      new PrefixEncoding(
        new BufferEncoding(), // asset ID
        new PrefixEncoding(
          new BigU64BEEncoding(), // value
          new BufferEncoding(), // note hash
          8,
        ),
        32,
      ),
      4,
    ),
    valueEncoding: NULL_ENCODING,
  })

  return { valueToUnspentNoteHash }
}
