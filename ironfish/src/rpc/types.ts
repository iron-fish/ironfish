/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'

export type RpcAsset = {
  id: string
  metadata: string
  name: string
  nonce: number
  creator: string
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
  })
  .defined()

export type RpcEncryptedNote = {
  /**
   * @deprecated Please use hash instead
   */
  commitment: string
  hash: string
  serialized: string
}

export const RpcEncryptedNoteSchema: yup.ObjectSchema<RpcEncryptedNote> = yup
  .object({
    commitment: yup.string().defined(),
    hash: yup.string().defined(),
    serialized: yup.string().defined(),
  })
  .defined()

export type RpcNote = {
  assetId: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
  hash: string
  value: string
  memo: string
}

export const RpcNoteSchema = yup
  .object()
  .shape({
    assetId: yup.string().required(),
    assetName: yup.string().required(),
    hash: yup.string().required(),
    value: yup.string().required(),
    memo: yup.string().required(),
  })
  .required()

export type RpcWalletNote = {
  assetId: string
  value: string
  memo: string
  sender: string
  owner: string
  hash: string
  transactionHash: string
  spent: boolean
  index: number | null
  nullifier: string | null
}
