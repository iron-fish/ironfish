/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BlockHeader } from '../../../primitives'
import { BigIntUtils } from '../../../utils'

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
}

export function serializeRpcBlockHeader(header: BlockHeader): RpcBlockHeader {
  return {
    hash: header.hash.toString('hex'),
    sequence: Number(header.sequence),
    previousBlockHash: header.previousBlockHash.toString('hex'),
    timestamp: header.timestamp.valueOf(),
    difficulty: header.target.toDifficulty().toString(),
    graffiti: header.graffiti.toString('hex'),
    noteCommitment: header.noteCommitment.toString('hex'),
    transactionCommitment: header.transactionCommitment.toString('hex'),
    target: BigIntUtils.writeBigU256BE(header.target.asBigInt()).toString('hex'),
    randomness: BigIntUtils.writeBigU64BE(header.randomness).toString('hex'),
  }
}

export const RpcBlockHeaderSchema: yup.ObjectSchema<RpcBlockHeader> = yup
  .object({
    hash: yup.string().defined(),
    sequence: yup.number().defined(),
    previousBlockHash: yup.string().defined(),
    timestamp: yup.number().defined(),
    transactions: yup.array().defined(),
    difficulty: yup.string().defined(),
    graffiti: yup.string().defined(),
    noteCommitment: yup.string().defined(),
    transactionCommitment: yup.string().defined(),
    target: yup.string().defined(),
    randomness: yup.string().defined(),
  })
  .defined()
