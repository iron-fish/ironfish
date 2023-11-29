/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { MINED_RESULT } from '../../../mining/manager'
import { FullNode } from '../../../node'
import { SerializedBlockTemplate } from '../../../serde'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type SubmitBlockRequest = SerializedBlockTemplate

export type SubmitBlockResponse = {
  added: boolean
  reason:
    | 'UNKNOWN_REQUEST'
    | 'CHAIN_CHANGED'
    | 'INVALID_BLOCK'
    | 'ADD_FAILED'
    | 'FORK'
    | 'SUCCESS'
}

const serializedBlockTemplateSchema: yup.ObjectSchema<SubmitBlockRequest> = yup
  .object({
    header: yup
      .object({
        sequence: yup.number().required(),
        previousBlockHash: yup.string().required(),
        noteCommitment: yup.string().required(),
        transactionCommitment: yup.string().required(),
        target: yup.string().required(),
        randomness: yup.string().required(),
        timestamp: yup.number().required(),
        graffiti: yup.string().required(),
      })
      .required()
      .defined(),
    transactions: yup.array().of(yup.string().required()).required().defined(),
  })
  .required()
  .defined()

export const SubmitBlockRequestSchema: yup.ObjectSchema<SubmitBlockRequest> =
  serializedBlockTemplateSchema

export const SubmitBlockResponseSchema: yup.ObjectSchema<SubmitBlockResponse> = yup
  .object({
    added: yup.boolean().defined(),
    reason: yup
      .string()
      .oneOf([
        'UNKNOWN_REQUEST',
        'CHAIN_CHANGED',
        'INVALID_BLOCK',
        'ADD_FAILED',
        'FORK',
        'SUCCESS',
      ])
      .defined(),
  })
  .defined()

routes.register<typeof SubmitBlockRequestSchema, SubmitBlockResponse>(
  `${ApiNamespace.miner}/submitBlock`,
  SubmitBlockRequestSchema,
  async (request, context): Promise<void> => {
    Assert.isInstanceOf(context, FullNode)

    const result = await context.miningManager.submitBlockTemplate(request.data)

    request.end({
      added: result === MINED_RESULT.SUCCESS,
      reason: result,
    })
  },
)
