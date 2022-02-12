/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Target } from '../../../primitives/target'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type NewBlocksStreamRequest = Record<string, never> | undefined
export type NewBlocksStreamResponse = {
  bytes: { type: 'Buffer'; data: number[] }
  target: string
  miningRequestId: number
  sequence: number
}

export const NewBlocksStreamRequestSchema: yup.MixedSchema<NewBlocksStreamRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const NewBlocksStreamResponseSchema: yup.ObjectSchema<NewBlocksStreamResponse> = yup
  .object({
    bytes: yup
      .object({
        type: yup
          .mixed()
          .oneOf(['Buffer'] as const)
          .required(),
        data: yup.array().of(yup.number().integer().required()).required(),
      })
      .required(),
    target: yup.string().required(),
    miningRequestId: yup.number().required(),
    sequence: yup.number().required(),
  })
  .required()
  .defined()

router.register<typeof NewBlocksStreamRequestSchema, NewBlocksStreamResponse>(
  `${ApiNamespace.miner}/newBlocksStream`,
  NewBlocksStreamRequestSchema,
  async (request, node): Promise<void> => {
    if (!node.config.get('enableMiningDirector')) {
      node.config.setOverride('enableMiningDirector', true)
    }

    if (!node.miningDirector.minerAccount) {
      throw new ValidationError(
        `The node you are connecting to doesn't have a default account.
        Create and set a default account using "ironfish accounts" first.
        `,
      )
    }

    const onBlock = (event: {
      miningRequestId: number
      bytes: Buffer
      target: Target
      sequence: number
    }) => {
      request.stream({
        bytes: event.bytes.toJSON(),
        target: event.target.asBigInt().toString(),
        miningRequestId: event.miningRequestId,
        sequence: event.sequence,
      })
    }

    if (node.miningDirector.isStarted() === false) {
      void node.miningDirector.start()
    }

    node.miningDirector.miners++

    request.onClose.once(() => {
      node.miningDirector.miners--
      node.miningDirector.onBlockToMine.off(onBlock)

      if (node.miningDirector.miners === 0) {
        node.miningDirector.shutdown()
      }
    })

    node.miningDirector.onBlockToMine.on(onBlock)

    // 'prime' the stream with the current block
    if (node.chain.head) {
      await node.miningDirector.onChainHeadChange(node.chain.head)
    }
  },
)
