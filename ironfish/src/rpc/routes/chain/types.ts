/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'

export type RpcNote = {
  hash: string
  serialized: string
}

export const RpcNoteSchema: yup.ObjectSchema<RpcNote> = yup
  .object({
    hash: yup.string().defined(),
    serialized: yup.string().defined(),
  })
  .defined()

export type RpcMint = {
  id: string
  metadata: string
  name: string
  owner: string
  value: string
}

export const RpcMintSchema: yup.ObjectSchema<RpcMint> = yup
  .object({
    id: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    owner: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

export type RpcBurn = {
  id: string
  value: string
}

export const RpcBurnSchema: yup.ObjectSchema<RpcBurn> = yup
  .object({
    id: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

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

export type RpcTransaction = {
  serialized?: string
  hash: string
  size: number
  fee: number
  expiration: number
  notes: { commitment: string }[]
  spends: RpcSpend[]
  mints: RpcMint[]
  burns: RpcBurn[]
}

export const RpcTransactionSchema: yup.ObjectSchema<RpcTransaction> = yup
  .object({
    serialized: yup.string().optional(),
    hash: yup.string().defined(),
    size: yup.number().defined(),
    fee: yup.number().defined(),
    expiration: yup.number().defined(),
    notes: yup
      .array(
        yup
          .object({
            commitment: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
    spends: yup.array(RpcSpendSchema).defined(),
    mints: yup.array(RpcMintSchema).defined(),
    burns: yup.array(RpcBurnSchema).defined(),
  })
  .defined()
