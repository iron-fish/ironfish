/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { IronfishNode } from '../../../node'
import { ValidationError } from '../../adapters'
import { RpcRequest } from '../../request'

export type Request =
  | {
      sequence?: number | null
    }
  | undefined

export type Response = {
  sequence: number
  hash: string
  difficulty: string
}

export const RequestSchema: yup.ObjectSchema<Request> = yup
  .object({
    sequence: yup.number().nullable().optional(),
  })
  .defined()

export const ResponseSchema: yup.ObjectSchema<Response> = yup
  .object({
    sequence: yup.number().defined(),
    hash: yup.string().defined(),
    difficulty: yup.string().defined(),
  })
  .defined()

export const route = 'getDifficulty'
export const handle = async (
  request: RpcRequest<Request, Response>,
  node: IronfishNode,
): Promise<void> => {
  let sequence = node.chain.head.sequence
  let block = node.chain.head

  if (request.data?.sequence) {
    const sequenceBlock = await node.chain.getHeaderAtSequence(request.data.sequence)
    if (!sequenceBlock) {
      throw new ValidationError(`No block found at sequence ${request.data.sequence}`)
    }
    sequence = sequenceBlock.sequence
    block = sequenceBlock
  }

  request.end({
    sequence,
    hash: block.hash.toString('hex'),
    difficulty: block.target.toDifficulty().toString(),
  })
}
