/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { AssetVerification, VerifiedAssetMetadata } from '../../../assets'

export type RpcSpend = {
  nullifier: string
  commitment: string
  size: number
}

export const RpcSpendSchema: yup.ObjectSchema<RpcSpend> = yup
  .object({
    nullifier: yup.string().defined(),
    commitment: yup.string().defined(),
    size: yup.number().defined(),
  })
  .defined()

export type RpcEncryptedNote = {
  hash: string
  serialized?: string
  /**
   * @deprecated Please use hash instead
   */
  commitment: string
}

export const RpcEncryptedNoteSchema: yup.ObjectSchema<RpcEncryptedNote> = yup
  .object({
    commitment: yup.string().defined(),
    hash: yup.string().defined(),
    serialized: yup.string().optional(),
  })
  .defined()

export type RpcBurn = {
  assetId: string
  value: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  id: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
}

export const RpcBurnSchema: yup.ObjectSchema<RpcBurn> = yup
  .object({
    id: yup.string().defined(),
    assetId: yup.string().defined(),
    assetName: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

export type RpcMint = {
  assetId: string
  value: string
  transferOwnershipTo?: string
  /**
   * @deprecated Please use assetId instead
   */
  id: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  metadata: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  name: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  creator: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  owner: string
}

export const RpcMintSchema: yup.ObjectSchema<RpcMint> = yup
  .object({
    assetId: yup.string().defined(),
    value: yup.string().defined(),
    transferOwnershipTo: yup.string().optional(),
    id: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    creator: yup.string().defined(),
    owner: yup.string().defined(),
    assetName: yup.string().defined(),
  })
  .defined()

export type RpcTransaction = {
  hash: string
  size: number
  fee: number
  expiration: number
  signature: string
  notes: RpcEncryptedNote[]
  spends: RpcSpend[]
  mints: RpcMint[]
  burns: RpcBurn[]
  serialized?: string
}

export const RpcTransactionSchema: yup.ObjectSchema<RpcTransaction> = yup
  .object({
    hash: yup.string().defined(),
    size: yup.number().defined(),
    fee: yup.number().defined(),
    expiration: yup.number().defined(),
    signature: yup.string().defined(),
    notes: yup.array(RpcEncryptedNoteSchema).defined(),
    spends: yup.array(RpcSpendSchema).defined(),
    mints: yup.array(RpcMintSchema).defined(),
    burns: yup.array(RpcBurnSchema).defined(),
    serialized: yup.string().optional(),
  })
  .defined()

export type RpcBlockHeader = {
  hash: string
  sequence: number
  previousBlockHash: string
  difficulty: string
  noteCommitment: string
  transactionCommitment: string
  target: string
  randomness: string
  timestamp: number
  graffiti: string
  work: string
  noteSize: number | null
  /**
   * @deprecated Please use previousBlockHash instead
   */
  previous: string
}

export const RpcBlockHeaderSchema: yup.ObjectSchema<RpcBlockHeader> = yup
  .object({
    hash: yup.string().defined(),
    previous: yup.string().defined(),
    sequence: yup.number().defined(),
    previousBlockHash: yup.string().defined(),
    timestamp: yup.number().defined(),
    difficulty: yup.string().defined(),
    graffiti: yup.string().defined(),
    noteCommitment: yup.string().defined(),
    transactionCommitment: yup.string().defined(),
    target: yup.string().defined(),
    randomness: yup.string().defined(),
    work: yup.string().defined(),
    noteSize: yup.number().nullable().defined(),
  })
  .defined()

export type RpcBlock = RpcBlockHeader & {
  size: number
  transactions: RpcTransaction[]
}

export const RpcBlockSchema: yup.ObjectSchema<RpcBlock> = RpcBlockHeaderSchema.concat(
  yup
    .object({
      size: yup.number().defined(),
      transactions: yup.array(RpcTransactionSchema).defined(),
    })
    .defined(),
)

export type RpcAssetVerification = {
  status: AssetVerification['status']
} & Partial<VerifiedAssetMetadata>

export type RpcAsset = {
  id: string
  name: string
  nonce: number
  owner: string
  creator: string
  metadata: string
  createdTransactionHash: string
  verification: RpcAssetVerification
  supply?: string
  /**
   * @deprecated query for the transaction to find it's status
   */
  status: string
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    verification: yup
      .object({
        status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined(),
        symbol: yup.string().optional(),
        decimals: yup.number().optional(),
        logoURI: yup.string().optional(),
        website: yup.string().optional(),
      })
      .defined(),
    status: yup.string().defined(),
    supply: yup.string().optional(),
    owner: yup.string().defined(),
    createdTransactionHash: yup.string().defined(),
  })
  .defined()
