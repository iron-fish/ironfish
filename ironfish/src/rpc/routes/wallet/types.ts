/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { TransactionStatus, TransactionType } from '../../../wallet'
import { AccountImport } from '../../../wallet/walletdb/accountValue'
import { RpcSpend, RpcSpendSchema } from '../chain'

export type RcpAccountAssetBalanceDelta = {
  assetId: string
  /**
   * @deprecated Please use the getAsset RPC to fetch additional asset details
   */
  assetName: string
  delta: string
}

export const RcpAccountAssetBalanceDeltaSchema: yup.ObjectSchema<RcpAccountAssetBalanceDelta> =
  yup
    .object({
      assetId: yup.string().defined(),
      assetName: yup.string().defined(),
      delta: yup.string().defined(),
    })
    .defined()

export type RpcWalletNote = {
  value: string
  assetId: string
  /**
   * @deprecated Please use `asset.name` instead
   */
  assetName: string
  memo: string
  sender: string
  owner: string
  noteHash: string
  transactionHash: string
  index: number | null
  nullifier: string | null
  spent: boolean
  /**
   * @deprecated Please use `owner` address instead
   */
  isOwner: boolean
  /**
   * @deprecated Please use `noteHash` instead
   */
  hash: string
}

export const RpcWalletNoteSchema: yup.ObjectSchema<RpcWalletNote> = yup
  .object({
    value: yup.string().defined(),
    assetId: yup.string().defined(),
    assetName: yup.string().defined(),
    memo: yup.string().defined(),
    sender: yup.string().defined(),
    owner: yup.string().defined(),
    noteHash: yup.string().defined(),
    transactionHash: yup.string().defined(),
    index: yup.number(),
    nullifier: yup.string(),
    spent: yup.boolean().defined(),
    isOwner: yup.boolean().defined(),
    hash: yup.string().defined(),
  })
  .defined()

export type RpcAccountTransaction = {
  hash: string
  fee: string
  serialized: string
  notesCount: number
  spendsCount: number
  mintsCount: number
  burnsCount: number
  expiration: number
  timestamp: number
  submittedSequence: number
  /**
   * @deprecated This is configuarable via the node config, a setting that the user can pass, so doesn't need to be returned
   */
  confirmations: number
  type: TransactionType
  status: TransactionStatus
  assetBalanceDeltas: RcpAccountAssetBalanceDelta[]
  blockHash?: string
  blockSequence?: number
  notes?: RpcWalletNote[]
  spends?: RpcSpend[]
}

export const RpcAccountTransactionSchema: yup.ObjectSchema<RpcAccountTransaction> = yup
  .object({
    hash: yup.string().defined(),
    fee: yup.string().defined(),
    blockHash: yup.string(),
    serialized: yup.string().defined(),
    blockSequence: yup.number(),
    notesCount: yup.number().defined(),
    spendsCount: yup.number().defined(),
    mintsCount: yup.number().defined(),
    burnsCount: yup.number().defined(),
    expiration: yup.number().defined(),
    timestamp: yup.number().defined(),
    submittedSequence: yup.number().defined(),
    status: yup.string().oneOf(Object.values(TransactionStatus)).defined(),
    confirmations: yup.number().defined(),
    type: yup.string().oneOf(Object.values(TransactionType)).defined(),
    assetBalanceDeltas: yup.array(RcpAccountAssetBalanceDeltaSchema).defined(),
    notes: yup.array(RpcWalletNoteSchema).optional(),
    spends: yup.array(RpcSpendSchema).optional(),
  })
  .defined()

export type RpcAccountImport = Omit<AccountImport, 'createdAt'> & {
  createdAt: { hash: string; sequence: number } | null
}

export const RpcAccountImportSchema: yup.ObjectSchema<RpcAccountImport> = yup
  .object({
    name: yup.string().defined(),
    spendingKey: yup.string().nullable().defined(),
    viewKey: yup.string().defined(),
    publicAddress: yup.string().defined(),
    incomingViewKey: yup.string().defined(),
    outgoingViewKey: yup.string().defined(),
    version: yup.number().defined(),
    createdAt: yup
      .object({
        hash: yup.string().defined(),
        sequence: yup.number().defined(),
      })
      .nullable()
      .defined(),
  })
  .defined()
