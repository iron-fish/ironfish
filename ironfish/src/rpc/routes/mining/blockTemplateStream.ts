/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Block } from '../../../primitives/block'
import { SerializedBlockTemplate } from '../../../serde/BlockTemplateSerde'
import { ApiNamespace, router } from '../router'

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

router.register<typeof BlockTemplateStreamRequestSchema, BlockTemplateStreamResponse>(
  `${ApiNamespace.miner}/blockTemplateStream`,
  BlockTemplateStreamRequestSchema,
  async (request, node): Promise<void> => {
    if (!node.chain.synced && !node.config.get('miningForce')) {
      node.logger.info(
        'Miner connected while the node is syncing. Will not start mining until the node is synced',
      )
    }

    // Construct a new block template and send it to the stream listener
    const streamNewBlockTemplate = async (block: Block) => {
      // If we mine when were not synced when we will mine a fork no one cares about
      if (!node.chain.synced && !node.config.get('miningForce')) {
        return
      }

      // If we mine when were not connected to anyone, then no one will get our blocks
      if (!node.peerNetwork.isReady && !node.config.get('miningForce')) {
        return
      }

      const serializedBlock = await node.miningManager.createNewBlockTemplate(block)
      request.stream(serializedBlock)
    }

    // Wrap the listener function to avoid a deadlock from chain.newBlock()
    const timeoutWrappedListener = (block: Block) => {
      setTimeout(() => {
        void streamNewBlockTemplate(block)
      })
    }

    // Begin listening for chain head changes to generate new block templates to send to listeners
    node.chain.onConnectBlock.on(timeoutWrappedListener)

    // Send an initial block template to the requester so they can begin working immediately
    const currentHeadBlock = await node.chain.getBlock(node.chain.head)
    if (currentHeadBlock != null) {
      await streamNewBlockTemplate(currentHeadBlock)
    }

    node.miningManager.minersConnected++

    // If the listener stops listening, we no longer need to generate new block templates
    request.onClose.once(() => {
      node.miningManager.minersConnected--
      node.chain.onConnectBlock.off(timeoutWrappedListener)
    })
  },
)
