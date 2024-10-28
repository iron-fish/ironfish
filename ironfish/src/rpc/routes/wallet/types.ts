/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { TransactionStatus, TransactionType } from '../../../wallet'
import { RpcSpend, RpcSpendSchema } from '../chain'
import { RpcBurn, RpcBurnSchema, RpcMint, RpcMintSchema } from '../chain/types'

export type RpcAccountAssetBalanceDelta = {
  assetId: string
  delta: string
  /**
   * @deprecated Please use the getAsset RPC to fetch additional asset details
   */
  assetName: string
}

export const RcpAccountAssetBalanceDeltaSchema: yup.ObjectSchema<RpcAccountAssetBalanceDelta> =
  yup
    .object({
      assetId: yup.string().defined(),
      delta: yup.string().defined(),
      assetName: yup.string().defined(),
    })
    .defined()

export type RpcTransactionNote = {
  assetId: string
  memo: string
  noteHash: string
  owner: string
  sender: string
  value: string
}

export const RpcTransactionNoteSchema: yup.ObjectSchema<RpcTransactionNote> = yup
  .object({
    assetId: yup.string().defined(),
    memo: yup.string().defined(),
    noteHash: yup.string().defined(),
    owner: yup.string().defined(),
    sender: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

export type RpcWalletNote = {
  assetId: string
  value: string
  memo: string
  memoHex: string
  sender: string
  owner: string
  noteHash: string
  transactionHash: string
  spent: boolean
  index: number | null
  nullifier: string | null
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
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
    memoHex: yup.string().defined(),
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

export type RpcWalletTransaction = {
  hash: string
  fee: string
  signature: string
  expiration: number
  timestamp: number
  submittedSequence: number
  type: TransactionType
  status: TransactionStatus
  assetBalanceDeltas: RpcAccountAssetBalanceDelta[]
  burns: RpcBurn[]
  mints: RpcMint[]
  serialized?: string
  blockHash?: string
  blockSequence?: number
  notes?: RpcWalletNote[]
  spends?: RpcSpend[]
  /**
   * @deprecated Please use `notes.length` instead
   */
  notesCount: number
  /**
   * @deprecated Please use `spends.length` instead
   */
  spendsCount: number
  /**
   * @deprecated Please use `mints.length` instead
   */
  mintsCount: number
  /**
   * @deprecated Please use `burns.length` instead
   */
  burnsCount: number
  /**
   * @deprecated This is configuarable via the node config, a setting that the user can pass, so doesn't need to be returned
   */
  confirmations: number
}

export const RpcWalletTransactionSchema: yup.ObjectSchema<RpcWalletTransaction> = yup
  .object({
    hash: yup.string().defined(),
    fee: yup.string().defined(),
    blockHash: yup.string(),
    blockSequence: yup.number(),
    signature: yup.string().defined(),
    serialized: yup.string().optional(),
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
    mints: yup.array(RpcMintSchema).defined(),
    burns: yup.array(RpcBurnSchema).defined(),
  })
  .defined()

export type RpcMultisigKeys = {
  identity?: string
  secret?: string
  keyPackage?: string
  publicKeyPackage: string
}

export type RpcAccountStatus = {
  name: string
  id: string
  head: {
    hash: string
    sequence: number
    inChain: boolean | null
  } | null
  scanningEnabled: boolean
  viewOnly: boolean
  default: boolean
}

export const RpcAccountStatusSchema: yup.ObjectSchema<RpcAccountStatus> = yup
  .object<RpcAccountStatus>({
    name: yup.string().defined(),
    id: yup.string().defined(),
    head: yup
      .object({
        hash: yup.string().defined(),
        sequence: yup.number().defined(),
        inChain: yup.boolean().nullable().defined(),
      })
      .nullable()
      .defined(),
    scanningEnabled: yup.boolean().defined(),
    viewOnly: yup.boolean().defined(),
    default: yup.boolean().defined(),
  })
  .defined()
