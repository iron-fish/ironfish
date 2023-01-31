/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../../../node'
import { TransactionValue } from '../../../wallet/walletdb/transactionValue'

export type RpcAccountTransaction = {
  hash: string
  fee: string
  blockHash?: string
  blockSequence?: number
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  timestamp: number
}

export type RcpAccountAssetBalanceDelta = {
  assetId: string
  assetName: string
  delta: string
}

export type RpcAccountDecryptedNote = {
  isOwner: boolean
  value: string
  assetId: string
  assetName: string
  memo: string
  sender: string
  owner: string
  spent: boolean
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
