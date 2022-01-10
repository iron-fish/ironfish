/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Block } from '../../../primitives'

export type RpcBlock = {
  hash: string
  sequence: number
  previousBlockHash: string
  timestamp: number
  transactions: Array<unknown>
  difficulty: string
  graffiti: string
}

export function serializeRpcBlock(block: Block): RpcBlock {
  return {
    hash: block.header.hash.toString('hex'),
    sequence: Number(block.header.sequence),
    previousBlockHash: block.header.previousBlockHash.toString('hex'),
    timestamp: block.header.timestamp.valueOf(),
    transactions: [],
    difficulty: block.header.target.toDifficulty().toString(),
    graffiti: block.header.graffiti.toString('hex'),
  }
}

export const RpcBlockSchema: yup.ObjectSchema<RpcBlock> = yup
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
