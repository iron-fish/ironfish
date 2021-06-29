/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishBlock } from '../../../primitives'

export type RpcBlock = {
  hash: string
  height: number
  previousBlockHash: string
  timestamp: number
  transactions: Array<unknown>
}

export function serializeRpcBlock(block: IronfishBlock): RpcBlock {
  return {
    hash: block.header.hash.toString('hex'),
    height: Number(block.header.height),
    previousBlockHash: block.header.previousBlockHash.toString('hex'),
    timestamp: block.header.timestamp.valueOf(),
    transactions: [],
  }
}

export const RpcBlockSchema: yup.ObjectSchema<RpcBlock> = yup
  .object({
    hash: yup.string().defined(),
    height: yup.number().defined(),
    previousBlockHash: yup.string().defined(),
    timestamp: yup.number().defined(),
    transactions: yup.array().defined(),
  })
  .defined()
