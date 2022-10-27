/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { Account } from '../../../wallet'
import { ValidationError } from '../../adapters'

export function getAccount(node: IronfishNode, name?: string): Account {
  if (name) {
    const account = node.wallet.getAccountByName(name)
    if (account) {
      return account
    }
    throw new ValidationError(`No account with name ${name}`)
  }

  const defaultAccount = node.wallet.getDefaultAccount()
  if (defaultAccount) {
    return defaultAccount
  }

  throw new ValidationError(
    `No account is currently active.\n\n` +
      `Use ironfish accounts:create <name> to first create an account`,
  )
}

export async function getTransactionNotes(
  account: Account,
  transaction: Transaction,
): Promise<
  ReadonlyArray<{
    owner: boolean
    amount: number
    memo: string
    transactionHash: string
    spent: boolean | undefined
  }>
> {
  const transactionNotes = []

  for (const note of transaction.outputDescriptions()) {
    let decryptedNote
    let owner

    // Try loading the decrypted note from the account
    const decryptedNoteValue = await account.getDecryptedNote(note.merkleHash())

    if (decryptedNoteValue) {
      decryptedNote = decryptedNoteValue.note
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
          transactionHash: transaction.unsignedHash().toString('hex'),
          spent: decryptedNoteValue?.spent,
        })
      }
    }
  }

  return transactionNotes
}
