/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NoteEncrypted, TransactionPosted } from '@ironfish/rust-nodejs'

export type GetUnspentNotesRequest = {
  type: 'getUnspentNotes'
  serializedTransactionPosted: Buffer
  accounts: string[]
}

export type GetUnspentNotesResponse = {
  type: 'getUnspentNotes'
  notes: Array<{
    account: string
    hash: string
    note: Buffer
  }>
}

export function handleGetUnspentNotes({
  accounts,
  serializedTransactionPosted,
}: GetUnspentNotesRequest): GetUnspentNotesResponse {
  const transaction = new TransactionPosted(serializedTransactionPosted)

  const results: GetUnspentNotesResponse['notes'] = []

  for (let i = 0; i < transaction.notesLength(); i++) {
    const serializedNote = transaction.getNote(i)
    const note = new NoteEncrypted(serializedNote)

    // Notes can be spent and received by the same Account.
    // Try decrypting the note as its owner
    for (const account of accounts) {
      const decryptedNote = note.decryptNoteForOwner(account)

      if (decryptedNote) {
        results.push({
          hash: note.merkleHash().toString('hex'),
          note: decryptedNote,
          account: account,
        })

        break
      }
    }
  }

  return { type: 'getUnspentNotes', notes: results }
}
