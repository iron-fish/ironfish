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
  U32_ENCODING_BE,
} from '../../../../storage'
import { Account } from '../../../../wallet'

export function GetOldStores(db: IDatabase): {
  unspentNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], Buffer, number, bigint, Buffer]
    value: null
  }>
} {
  const unspentNoteHashes: IDatabaseStore<{
    key: [Account['prefix'], Buffer, number, bigint, Buffer]
    value: null
  }> = db.addStore({
    name: 'un',
    keyEncoding: new PrefixArrayEncoding([
      [new BufferEncoding(), 4], // account prefix
      [new BufferEncoding(), 32], // asset ID
      [U32_ENCODING_BE, 4], // sequence
      [new BigU64BEEncoding(), 8], // value
      [new BufferEncoding(), 32], // note hash
    ]),
    valueEncoding: NULL_ENCODING,
  })

  return { unspentNoteHashes }
}
