/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import bufio from 'bufio'
import { Transaction } from '../../primitives'

// 32-byte transaction hash and 4-byte note index within the transaction
export const NOTE_OUTPOINT_LENGTH = 32 + 4

export type NoteOutpoint = Buffer

export function getNoteOutpoint(transaction: Transaction, index: number): Buffer {
  const bw = bufio.write(NOTE_OUTPOINT_LENGTH)
  bw.writeHash(transaction.hash())
  bw.writeU32BE(index)
  return bw.render()
}
