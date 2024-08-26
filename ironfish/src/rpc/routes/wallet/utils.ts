/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { Note } from '../../../primitives'
import { Account, Wallet } from '../../../wallet'
import { DecryptedNoteValue } from '../../../wallet/walletdb/decryptedNoteValue'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { WorkerPool } from '../../../workerPool'
import { RpcValidationError } from '../../adapters'
import { serializeRpcWalletNote } from './serializers'
import { RpcWalletNote } from './types'

export function getAccount(wallet: Wallet, name?: string): Account {
  if (wallet.locked) {
    throw new RpcValidationError('Wallet is locked. Unlock the wallet to fetch accounts')
  }

  if (name) {
    const account = wallet.getAccountByName(name)
    if (account) {
      return account
    }
    throw new RpcValidationError(`No account with name ${name}`)
  }

  const defaultAccount = wallet.getDefaultAccount()
  if (defaultAccount) {
    return defaultAccount
  }

  throw new RpcValidationError(
    `No account is currently active.\n\n` +
      `Use ironfish wallet:create <name> to first create an account`,
  )
}

export async function getTransactionNotes(
  workerPool: WorkerPool,
  account: Account,
  transaction: TransactionValue,
): Promise<Array<DecryptedNoteValue>> {
  const notes = []
  const decryptNotesPayloads = []
  const accountKeys = [
    {
      accountId: account.id,
      incomingViewKey: Buffer.from(account.incomingViewKey, 'hex'),
      outgoingViewKey: Buffer.from(account.outgoingViewKey, 'hex'),
      viewKey: Buffer.from(account.viewKey, 'hex'),
    },
  ]

  let accountHasSpend = false
  for (const spend of transaction.transaction.spends) {
    const noteHash = await account.getNoteHash(spend.nullifier)

    if (noteHash !== undefined) {
      accountHasSpend = true
      break
    }
  }

  for (const note of transaction.transaction.notes) {
    const decryptedNote = await account.getDecryptedNote(note.hash())

    if (decryptedNote) {
      notes.push(decryptedNote)
      continue
    }

    decryptNotesPayloads.push({
      serializedNote: note.serialize(),
      currentNoteIndex: null,
    })
  }

  if (accountHasSpend && decryptNotesPayloads.length > 0) {
    const decryptedSends = (
      await workerPool.decryptNotes(accountKeys, decryptNotesPayloads, {
        decryptForSpender: true,
      })
    ).get(account.id)
    Assert.isNotUndefined(decryptedSends)

    for (const note of decryptedSends) {
      if (note === undefined) {
        continue
      }

      notes.push({
        accountId: '',
        note: new Note(note.serializedNote),
        index: null,
        nullifier: null,
        transactionHash: transaction.transaction.hash(),
        spent: false,
        blockHash: transaction.blockHash,
        sequence: transaction.sequence,
      })
    }
  }

  return notes
}

export async function getAccountDecryptedNotes(
  workerPool: WorkerPool,
  account: Account,
  transaction: TransactionValue,
): Promise<RpcWalletNote[]> {
  const notes = await getTransactionNotes(workerPool, account, transaction)

  const serializedNotes: RpcWalletNote[] = []

  for await (const decryptedNote of notes) {
    const asset = await account.getAsset(decryptedNote.note.assetId())

    serializedNotes.push(serializeRpcWalletNote(decryptedNote, account.publicAddress, asset))
  }

  return serializedNotes
}
