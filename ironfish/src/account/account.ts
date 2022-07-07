/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import MurmurHash3 from 'imurmurhash'
import { Note } from '../primitives/note'
import { AccountsValue } from './database/accounts'
import { DecryptedNotesValue } from './database/decryptedNotes'

export const ACCOUNT_KEY_LENGTH = 32

export class Account {
  private readonly decryptedNotes: Map<string, DecryptedNotesValue>

  readonly id: string
  readonly displayName: string
  name: string
  readonly spendingKey: string
  readonly incomingViewKey: string
  readonly outgoingViewKey: string
  publicAddress: string
  rescan: number | null

  constructor({
    id,
    name,
    spendingKey,
    incomingViewKey,
    outgoingViewKey,
    publicAddress,
    rescan,
    decryptedNotes,
  }: {
    id: string
    name: string
    spendingKey: string
    incomingViewKey: string
    outgoingViewKey: string
    publicAddress: string
    rescan: number | null
    decryptedNotes: Map<string, DecryptedNotesValue>
  }) {
    this.id = id
    this.name = name
    this.spendingKey = spendingKey
    this.incomingViewKey = incomingViewKey
    this.outgoingViewKey = outgoingViewKey
    this.publicAddress = publicAddress
    this.rescan = rescan

    const prefixHash = new MurmurHash3(this.spendingKey, 1)
      .hash(this.incomingViewKey)
      .hash(this.outgoingViewKey)
      .result()
      .toString(16)
    const hashSlice = prefixHash.slice(0, 7)
    this.displayName = `${this.name} (${hashSlice})`

    this.decryptedNotes = decryptedNotes
  }

  serialize(): AccountsValue {
    return {
      name: this.name,
      spendingKey: this.spendingKey,
      incomingViewKey: this.incomingViewKey,
      outgoingViewKey: this.outgoingViewKey,
      publicAddress: this.publicAddress,
      rescan: this.rescan,
    }
  }

  getUnspentNotes(): ReadonlyArray<{
    hash: string
    index: number | null
    note: Note
    transactionHash: Buffer | null
  }> {
    const unspentNotes = []

    for (const [
      hash,
      { accountId, noteIndex, serializedNote, spent, transactionHash },
    ] of this.decryptedNotes.entries()) {
      // TODO(rohanjadvani): Remove the accountId check once each account owns
      // its own decrypted notes
      if (accountId === this.id && !spent) {
        unspentNotes.push({
          hash,
          index: noteIndex,
          note: new Note(serializedNote),
          transactionHash,
        })
      }
    }

    return unspentNotes
  }
}
