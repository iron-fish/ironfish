/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BlockHeader } from '../../../primitives'

export type RpcBlockHeader = {
  hash: string
  sequence: number
  previousBlockHash: string
  timestamp: number
  difficulty: string
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
  })
  .defined()
