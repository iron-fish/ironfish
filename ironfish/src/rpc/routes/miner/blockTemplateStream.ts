/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { SerializedBlockTemplate } from '../../../serde/BlockTemplateSerde'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type BlockTemplateStreamRequest = Record<string, never> | undefined
export type BlockTemplateStreamResponse = SerializedBlockTemplate

export const BlockTemplateStreamRequestSchema: yup.MixedSchema<BlockTemplateStreamRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const BlockTemplateStreamResponseSchema: yup.ObjectSchema<BlockTemplateStreamResponse> =
  yup
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
      previousBlockInfo: yup
        .object({
          target: yup.string().required(),
          timestamp: yup.number().required(),
        })
        .required()
        .defined(),
    })
    .required()
    .defined()

routes.register<typeof BlockTemplateStreamRequestSchema, BlockTemplateStreamResponse>(
  `${ApiNamespace.miner}/blockTemplateStream`,
  BlockTemplateStreamRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    if (!node.chain.synced && !node.config.get('miningForce')) {
      node.logger.info(
        'Miner connected while the node is syncing. Will not start mining until the node is synced',
      )
    }

    const streamBlockTemplate = (serializedBlock: SerializedBlockTemplate) => {
      request.stream(serializedBlock)
    }

    node.miningManager.onNewBlockTemplate(streamBlockTemplate)

    // If the listener stops listening, we no longer need to generate new block templates
    request.onClose.once(() => {
      node.miningManager.offNewBlockTemplate(streamBlockTemplate)
    })
  },
)
