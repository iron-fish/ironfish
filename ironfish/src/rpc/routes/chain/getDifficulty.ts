/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type GetDifficultyRequest =
  | {
      sequence?: number | null
    }
  | undefined

export type GetDifficultyResponse = {
  sequence: number
  hash: string
  difficulty: string
}

export const GetDifficultyRequestSchema: yup.ObjectSchema<GetDifficultyRequest> = yup
  .object({
    sequence: yup.number().nullable().optional(),
  })
  .defined()

export const GetDifficultyResponseSchema: yup.ObjectSchema<GetDifficultyResponse> = yup
  .object({
    sequence: yup.number().defined(),
    hash: yup.string().defined(),
    difficulty: yup.string().defined(),
  })
  .defined()

routes.register<typeof GetDifficultyRequestSchema, GetDifficultyResponse>(
  `${ApiNamespace.chain}/getDifficulty`,
  GetDifficultyRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    let sequence = node.chain.head.sequence
    let block = node.chain.head

    if (request.data?.sequence) {
      const sequenceBlock = await node.chain.getHeaderAtSequence(request.data.sequence)
      if (!sequenceBlock) {
        throw new RpcValidationError(`No block found at sequence ${request.data.sequence}`)
      }
      sequence = sequenceBlock.sequence
      block = sequenceBlock
    }

    request.end({
      sequence,
      hash: block.hash.toString('hex'),
      difficulty: block.target.toDifficulty().toString(),
    })
  },
)
