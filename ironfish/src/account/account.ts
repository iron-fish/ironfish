/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BufferMap } from 'buffer-map'
import MurmurHash3 from 'imurmurhash'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { Config } from '../fileStores'
import { Transaction } from '../primitives'
import { Note } from '../primitives/note'
import { AccountsValue } from './database/accounts'
import { DecryptedNotesValue } from './database/decryptedNotes'

export const ACCOUNT_KEY_LENGTH = 32

export class Account {
  private readonly chain: Blockchain
  private readonly config: Config
  private readonly decryptedNotes: Map<string, DecryptedNotesValue>
  private readonly transactions: BufferMap<
    Readonly<{
      transaction: Transaction
      blockHash: string | null
      submittedSequence: number | null
    }>
  >

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
    serializedAccount,
    chain,
    config,
    decryptedNotes,
    transactions,
  }: {
    id: string
    serializedAccount: AccountsValue
    chain: Blockchain
    config: Config
    decryptedNotes: Map<string, DecryptedNotesValue>
    transactions: BufferMap<
      Readonly<{
        transaction: Transaction
        blockHash: string | null
        submittedSequence: number | null
      }>
    >
  }) {
    this.id = id
    this.name = serializedAccount.name
    this.spendingKey = serializedAccount.spendingKey
    this.incomingViewKey = serializedAccount.incomingViewKey
    this.outgoingViewKey = serializedAccount.outgoingViewKey
    this.publicAddress = serializedAccount.publicAddress
    this.rescan = serializedAccount.rescan

    const prefixHash = new MurmurHash3(this.spendingKey, 1)
      .hash(this.incomingViewKey)
      .hash(this.outgoingViewKey)
      .result()
      .toString(16)
    const hashSlice = prefixHash.slice(0, 7)
    this.displayName = `${this.name} (${hashSlice})`

    this.chain = chain
    this.config = config
    this.decryptedNotes = decryptedNotes
    this.transactions = transactions
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

  async getUnspentNotes(): Promise<
    ReadonlyArray<{
      hash: string
      note: Note
      index: number | null
      confirmed: boolean
    }>
  > {
    const minimumBlockConfirmations = this.config.get('minimumBlockConfirmations')
    const unspentNotes = []

    for (const [
      hash,
      { accountId, noteIndex, serializedNote, spent, transactionHash },
    ] of this.decryptedNotes.entries()) {
      // TODO(rohanjadvani): Remove the accountId check once each account owns
      // its own decrypted notes
      if (accountId === this.id && !spent) {
        let confirmed = false

        if (transactionHash) {
          const transaction = this.transactions.get(transactionHash)
          Assert.isNotUndefined(transaction)
          const { blockHash } = transaction

          if (blockHash) {
            const header = await this.chain.getHeader(Buffer.from(blockHash, 'hex'))
            Assert.isNotNull(header)
            const main = await this.chain.isHeadChain(header)
            if (main) {
              const confirmations = this.chain.head.sequence - header.sequence
              confirmed = confirmations >= minimumBlockConfirmations
            }
          }
        }

        unspentNotes.push({
          hash,
          note: new Note(serializedNote),
          index: noteIndex,
          confirmed,
        })
      }
    }

    return unspentNotes
  }
}
