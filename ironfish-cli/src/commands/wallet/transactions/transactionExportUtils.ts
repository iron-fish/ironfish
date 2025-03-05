/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { GetAccountTransactionsResponse, RpcAsset, TransactionType } from '@ironfish/sdk'

export function getTransactionRowsByNote(
  assetLookup: { [key: string]: RpcAsset },
  accountLookup: Map<string, string>,
  transaction: GetAccountTransactionsResponse,
  format: 'notes' | 'transfers',
): TransactionNoteRow[] {
  const noteRows: TransactionNoteRow[] = []

  const nativeAssetId = Asset.nativeId().toString('hex')

  const notes = transaction.notes?.sort((n) => (n.assetId === nativeAssetId ? -1 : 1)) || []

  for (const note of notes) {
    const amount = BigInt(note.value)
    const assetId = note.assetId
    const assetName = assetLookup[note.assetId].name
    const assetDecimals = assetLookup[note.assetId].verification.decimals
    const assetSymbol = assetLookup[note.assetId].verification.symbol
    const sender = note.sender
    const recipient = note.owner
    const memo = note.memo
    const senderName = accountLookup.get(note.sender)
    const recipientName = accountLookup.get(note.owner)

    if (format === 'transfers' && note.sender === note.owner && !transaction.mints.length) {
      continue
    }

    noteRows.push({
      assetId,
      assetName,
      assetDecimals,
      assetSymbol,
      amount,
      sender,
      senderName,
      recipient,
      recipientName,
      memo,
    })
  }

  return noteRows
}

export function getTransactionRows(
  assetLookup: { [key: string]: RpcAsset },
  transaction: GetAccountTransactionsResponse,
): TransactionAssetRow[] {
  const nativeAssetId = Asset.nativeId().toString('hex')
  const feePaid = transaction.type === TransactionType.SEND ? BigInt(transaction.fee) : 0n

  const assetBalanceDeltas = transaction.assetBalanceDeltas.sort((d) =>
    d.assetId === nativeAssetId ? -1 : 1,
  )

  const assetRows: TransactionAssetRow[] = []

  for (const { assetId, delta } of assetBalanceDeltas) {
    const asset = assetLookup[assetId]
    let amount = BigInt(delta)

    if (assetId === Asset.nativeId().toString('hex')) {
      amount += feePaid
    }

    assetRows.push({
      assetId,
      assetName: asset.name,
      amount,
      assetDecimals: asset.verification.decimals,
      assetSymbol: asset.verification.symbol,
    })
  }

  return assetRows
}

export type TransactionNoteRow = {
  assetId: string
  assetName: string
  assetDecimals?: number
  assetSymbol?: string
  amount: bigint
  sender: string
  senderName?: string
  recipient: string
  recipientName?: string
  memo?: string
}

export type TransactionAssetRow = {
  assetId: string
  assetName: string
  amount: bigint
  assetDecimals: number | undefined
  assetSymbol: string | undefined
}
