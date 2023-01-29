/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { BlockHashSerdeInstance } from '../../../serde'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

// Get network difficulty at a specified sequence.
// If sequence is undefined, use current chain header difficulty as default.
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

router.register<typeof GetDifficultyRequestSchema, GetDifficultyResponse>(
  `${ApiNamespace.chain}/getDifficulty`,
  GetDifficultyRequestSchema,
  async (request, node): Promise<void> => {
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
      hash: BlockHashSerdeInstance.serialize(block.hash),
      difficulty: block.target.toDifficulty().toString(),
    })
  },
)
