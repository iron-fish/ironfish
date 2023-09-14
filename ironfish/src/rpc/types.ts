/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { AssetVerification } from '../assets'
import { BlockHeader } from '../primitives'
import { BigIntUtils } from '../utils'

export type RpcAsset = {
  id: string
  metadata: string
  name: string
  nonce: number
  creator: string
  verification: AssetVerification
  createdTransactionHash: string
  owner: string
  /**
   * @deprecated query for the transaction to find it's status
   */
  status: string
  supply?: string
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    verification: yup
      .object({ status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined() })
      .defined(),
    status: yup.string().defined(),
    supply: yup.string().optional(),
    owner: yup.string().defined(),
    createdTransactionHash: yup.string().defined(),
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

export type RpcBlockHeader = {
  hash: string
  /**
   * @deprecated Please use previousBlockHash instead
   */
  previous: string
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
}

export function serializeRpcBlockHeader(header: BlockHeader): RpcBlockHeader {
  return {
    hash: header.hash.toString('hex'),
    previous: header.previousBlockHash.toString('hex'),
    sequence: Number(header.sequence),
    previousBlockHash: header.previousBlockHash.toString('hex'),
    timestamp: header.timestamp.valueOf(),
    difficulty: header.target.toDifficulty().toString(),
    graffiti: header.graffiti.toString('hex'),
    noteCommitment: header.noteCommitment.toString('hex'),
    transactionCommitment: header.transactionCommitment.toString('hex'),
    target: BigIntUtils.writeBigU256BE(header.target.asBigInt()).toString(),
    randomness: BigIntUtils.writeBigU64BE(header.randomness).toString(),
    work: header.work.toString(),
    noteSize: header.noteSize ?? null,
  }
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
