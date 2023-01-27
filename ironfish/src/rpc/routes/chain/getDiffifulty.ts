/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
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
  difficulty: number
}

export const GetDifficultyRequestSchema: yup.ObjectSchema<GetDifficultyRequest> = yup
  .object({
    sequence: yup.number().nullable().optional(),
  })
  .defined()

export const GetDifficultyResponseSchema: yup.ObjectSchema<GetDifficultyResponse> = yup
  .object({
    sequence: yup.number().defined(),
    difficulty: yup.number().defined(),
  })
  .defined()

router.register<typeof GetDifficultyRequestSchema, GetDifficultyResponse>(
  `${ApiNamespace.chain}/getDifficulty`,
  GetDifficultyRequestSchema,
  async (request, node): Promise<void> => {
    let sequence = null
    let block = null

    if (request.data?.sequence) {
      sequence = request.data.sequence
      block = await node.chain.getHeaderAtSequence(sequence)
    }
    if (!block) {
      block = node.chain.head
      sequence = block.sequence
    }

    Assert.isNotNull(sequence)

    request.end({
      sequence,
      difficulty: Number(block.target.toDifficulty()),
    })
  },
)
