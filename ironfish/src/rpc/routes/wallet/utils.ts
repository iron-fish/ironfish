/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../../../node'
import { Note } from '../../../primitives'
import { CurrencyUtils } from '../../../utils'
import { Account } from '../../../wallet'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'
import { ValidationError } from '../../adapters'
import {
  RcpAccountAssetBalanceDelta,
  RpcAccountDecryptedNote,
  RpcAccountTransaction,
} from './types'

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
      `Use ironfish wallet:create <name> to first create an account`,
  )
}

export function serializeRpcAccountTransaction(
  transaction: TransactionValue,
): RpcAccountTransaction {
  return {
    hash: transaction.transaction.hash().toString('hex'),
    fee: transaction.transaction.fee().toString(),
    blockHash: transaction.blockHash?.toString('hex'),
    blockSequence: transaction.sequence ?? undefined,
    notesCount: transaction.transaction.notes.length,
    spendsCount: transaction.transaction.spends.length,
    mintsCount: transaction.transaction.mints.length,
    burnsCount: transaction.transaction.burns.length,
    expiration: transaction.transaction.expiration(),
    timestamp: transaction.timestamp.getTime(),
    submittedSequence: transaction.submittedSequence,
  }
}

export async function getAssetBalanceDeltas(
  node: IronfishNode,
  transaction: TransactionValue,
): Promise<RcpAccountAssetBalanceDelta[]> {
  const assetBalanceDeltas = new Array<RcpAccountAssetBalanceDelta>()

  for (const [assetId, delta] of transaction.assetBalanceDeltas.entries()) {
    // TODO: update to use wallet assets store
    const asset = await node.chain.getAssetById(assetId)

    const assetName = asset?.name.toString('hex') ?? ''

    assetBalanceDeltas.push({
      assetId: assetId.toString('hex'),
      assetName,
      delta: delta.toString(),
    })
  }

  return assetBalanceDeltas
}
export async function getAccountDecryptedNotes(
  node: IronfishNode,
  account: Account,
  transaction: TransactionValue,
): Promise<RpcAccountDecryptedNote[]> {
  const notesByAccount = await node.wallet.decryptNotes(transaction.transaction, null, true, [
    account,
  ])
  const notes = notesByAccount.get(account.id) ?? []

  const serializedNotes: RpcAccountDecryptedNote[] = []
  for await (const decryptedNote of notes) {
    const noteHash = decryptedNote.hash
    const decryptedNoteForOwner = await account.getDecryptedNote(noteHash)

    const isOwner = !!decryptedNoteForOwner
    const spent = decryptedNoteForOwner ? decryptedNoteForOwner.spent : false
    const note = decryptedNoteForOwner
      ? decryptedNoteForOwner.note
      : new Note(decryptedNote.serializedNote)

    const asset = await node.chain.getAssetById(note.assetId())

    serializedNotes.push({
      isOwner,
      owner: note.owner(),
      memo: note.memo(),
      value: CurrencyUtils.encode(note.value()),
      assetId: note.assetId().toString('hex'),
      assetName: asset?.name.toString('hex') || '',
      sender: note.sender(),
      spent: spent,
    })
  }

  return serializedNotes
}
