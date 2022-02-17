/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { MINED_RESULT } from '../../../mining/director'
import { SerializedBlockTemplate } from '../../../serde'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type SubmitBlockRequest = SerializedBlockTemplate
export type SubmitBlockResponse = Record<string, never> | undefined

const serializedBlockTemplateSchema: yup.ObjectSchema<SubmitBlockRequest> = yup
  .object({
    header: yup
      .object({
        sequence: yup.number().required(),
        previousBlockHash: yup.string().required(),
        noteCommitment: yup
          .object({
            commitment: yup.string().required(),
            size: yup.number().required(),
          })
          .required()
          .defined(),
        nullifierCommitment: yup
          .object({
            commitment: yup.string().required(),
            size: yup.number().required(),
          })
          .required()
          .defined(),
        target: yup.string().required(),
        randomness: yup.number().required(),
        timestamp: yup.number().required(),
        minersFee: yup.string().required(),
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
export const SubmitBlockResponseSchema: yup.MixedSchema<SubmitBlockResponse> = yup
  .mixed()
  .oneOf([undefined] as const)

router.register<typeof SubmitBlockRequestSchema, SubmitBlockResponse>(
  `${ApiNamespace.miner}/submitBlock`,
  SubmitBlockRequestSchema,
  async (request, node): Promise<void> => {
    const miningResult = await node.miningManager.submitBlockTemplate(request.data)
    if (miningResult !== MINED_RESULT.SUCCESS) {
      throw new ValidationError(miningResult)
    }

    request.end()
  },
)
