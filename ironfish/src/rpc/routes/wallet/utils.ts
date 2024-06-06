/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Note } from '../../../primitives'
import { Account, Base64JsonEncoder, Wallet } from '../../../wallet'
import { AccountImport } from '../../../wallet/exporter/accountImport'
import { DecryptedNoteValue } from '../../../wallet/walletdb/decryptedNoteValue'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { WorkerPool } from '../../../workerPool'
import { RpcValidationError } from '../../adapters'
import { serializeRpcWalletNote } from './serializers'
import { RpcWalletNote } from './types'

export function getAccount(wallet: Wallet, name?: string): Account {
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
      incomingViewKey: account.incomingViewKey,
      outgoingViewKey: account.outgoingViewKey,
      viewKey: account.viewKey,
      currentNoteIndex: null,
      decryptForSpender: true,
    })
  }

  if (accountHasSpend && decryptNotesPayloads.length > 0) {
    const decryptedSends = await workerPool.decryptNotes(decryptNotesPayloads)

    for (const note of decryptedSends) {
      if (note === null) {
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

export async function tryDecodeAccountWithMultisigSecrets(
  wallet: Wallet,
  value: string,
  options?: { name?: string },
): Promise<AccountImport | undefined> {
  const encoder = new Base64JsonEncoder()

  for await (const { name, secret } of wallet.walletDb.getMultisigSecrets()) {
    try {
      return encoder.decode(value, { name: options?.name ?? name, multisigSecret: secret })
    } catch (e: unknown) {
      continue
    }
  }

  return undefined
}
