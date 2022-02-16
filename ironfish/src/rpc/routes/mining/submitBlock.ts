/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { MINED_RESULT } from '../../../mining/director'
import { BlockTemplateSerde, SerializedBlockTemplate } from '../../../serde'
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
    const block = BlockTemplateSerde.deserialize(node.strategy, request.data)

    const blockDisplay = `${block.header.hash.toString('hex')} (${block.header.sequence})`
    if (!node.chain.head || !block.header.previousBlockHash.equals(node.chain.head.hash)) {
      node.logger.info(
        `Discarding mined block ${blockDisplay} that no longer attaches to heaviest head`,
      )

      throw new ValidationError(MINED_RESULT.CHAIN_CHANGED)
    }

    const validation = await node.chain.verifier.verifyBlock(block)

    if (!validation.valid) {
      node.logger.info(`Discarding invalid mined block ${blockDisplay}`, validation.reason)
      throw new ValidationError(MINED_RESULT.INVALID_BLOCK)
    }

    const { isAdded, reason, isFork } = await node.chain.addBlock(block)

    if (!isAdded) {
      node.logger.info(
        `Failed to add mined block ${blockDisplay} to chain with reason ${String(reason)}`,
      )
      throw new ValidationError(MINED_RESULT.ADD_FAILED)
    }

    if (isFork) {
      node.logger.info(
        `Failed to add mined block ${blockDisplay} to main chain. Block was added as a fork`,
      )
      throw new ValidationError(MINED_RESULT.FORK)
    }
    node.logger.info(
      `Successfully mined block ${blockDisplay} with ${block.transactions.length} transactions`,
    )

    node.miningDirector.onNewBlock.emit(block)
    request.end()
  },
)
