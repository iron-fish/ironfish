/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import {
  RpcBurn,
  RpcBurnSchema,
  RpcEncryptedNote,
  RpcEncryptedNoteSchema,
  RpcMint,
  RpcMintSchema,
} from '../../types'

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
  notes: RpcEncryptedNote[]
  spends: RpcSpend[]
  mints: RpcMint[]
  burns: RpcBurn[]
  signature?: string
}

export const RpcTransactionSchema: yup.ObjectSchema<RpcTransaction> = yup
  .object({
    serialized: yup.string().optional(),
    hash: yup.string().defined(),
    size: yup.number().defined(),
    fee: yup.number().defined(),
    expiration: yup.number().defined(),
    notes: yup.array(RpcEncryptedNoteSchema).defined(),
    spends: yup.array(RpcSpendSchema).defined(),
    mints: yup.array(RpcMintSchema).defined(),
    burns: yup.array(RpcBurnSchema).defined(),
    signature: yup.string().optional(),
  })
  .defined()
