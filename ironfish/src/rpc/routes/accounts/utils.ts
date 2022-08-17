/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../../../node'
import { Note, Transaction } from '../../../primitives'
import { Account } from '../../../wallet'
import { ValidationError } from '../../adapters'

export function getAccount(node: IronfishNode, name?: string): Account {
  if (name) {
    const account = node.accounts.getAccountByName(name)
    if (account) {
      return account
    }
    throw new ValidationError(`No account with name ${name}`)
  }

  const defaultAccount = node.accounts.getDefaultAccount()
  if (defaultAccount) {
    return defaultAccount
  }

  throw new ValidationError(
    `No account is currently active.\n\n` +
      `Use ironfish accounts:create <name> to first create an account`,
  )
}

export async function getTransactionStatus(
  node: IronfishNode,
  blockHash: Buffer | null,
  sequence: number | null,
  expirationSequence: number,
): Promise<string> {
  const headSequence = node.chain.head.sequence

  if (sequence && blockHash) {
    const sequenceHash = await node.chain.getHashAtSequence(sequence)
    if (sequenceHash && blockHash.equals(sequenceHash)) {
      const confirmations = headSequence - sequence
      const minimumBlockConfirmations = node.config.get('minimumBlockConfirmations')
      return confirmations >= minimumBlockConfirmations ? 'completed' : 'confirming'
    } else {
      return 'forked'
    }
  } else {
    return headSequence > expirationSequence ? 'expired' : 'pending'
  }
}

export function getTransactionNotes(
  account: Account,
  transaction: Transaction,
): ReadonlyArray<{
  owner: boolean
  amount: number
  memo: string
  transactionHash: string
  spent: boolean | undefined
}> {
  const transactionNotes = []

  for (const note of transaction.notes()) {
    let decryptedNote
    let owner

    // Try loading the decrypted note from the account
    const decryptedNoteValue = account.getDecryptedNote(note.merkleHash())

    if (decryptedNoteValue) {
      decryptedNote = new Note(decryptedNoteValue.serializedNote)
      owner = true
    } else {
      // Try decrypting the note using the outgoingViewKey
      decryptedNote = note.decryptNoteForSpender(account.outgoingViewKey)
      owner = false
    }
    if (decryptedNote) {
      if (decryptedNote.value() !== BigInt(0)) {
        transactionNotes.push({
          owner,
          amount: Number(decryptedNote.value()),
          memo: decryptedNote.memo(),
          transactionHash: transaction.hash().toString('hex'),
          spent: decryptedNoteValue?.spent,
        })
      }
    }
  }

  return transactionNotes
}
