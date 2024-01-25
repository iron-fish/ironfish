/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  BigU64BEEncoding,
  BufferEncoding,
  IDatabase,
  IDatabaseStore,
  NULL_ENCODING,
  PrefixArrayEncoding,
} from '../../../../storage'
import { Account } from '../../../../wallet'

export function GetNewStores(db: IDatabase): {
  valueToUnspentNoteHash: IDatabaseStore<{
    key: [Account['prefix'], Buffer, bigint, Buffer] // account prefix, asset ID, value, note hash
    value: null
  }>
} {
  const valueToUnspentNoteHash: IDatabaseStore<{
    key: [Account['prefix'], Buffer, bigint, Buffer] // account prefix, asset ID, value, note hash
    value: null
  }> = db.addStore({
    name: 'valueToUnspentNoteHashes',
    keyEncoding: new PrefixArrayEncoding([
      [new BufferEncoding(), 4], // account prefix
      [new BufferEncoding(), 32], // asset ID
      [new BigU64BEEncoding(), 8], // value
      [new BufferEncoding(), 32], // note hash
    ]),
    valueEncoding: NULL_ENCODING,
  })

  return { valueToUnspentNoteHash }
}
