/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Block } from '../../../primitives'
import { ApiNamespace, router } from '../router'
import { RpcBlock, RpcBlockSchema, serializeRpcBlock } from './types'

export type OnGossipRequest = undefined
export type OnGossipResponse = { block: RpcBlock }

export const OnGossipRequestSchema: yup.MixedSchema<OnGossipRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const OnGossipResponseSchema: yup.ObjectSchema<OnGossipResponse> = yup
  .object({
    block: RpcBlockSchema,
  })
  .defined()

router.register<typeof OnGossipRequestSchema, OnGossipResponse>(
  `${ApiNamespace.event}/onGossip`,
  OnGossipRequestSchema,
  (request, node): void => {
    function onGossip(block: Block) {
      const serialized = serializeRpcBlock(block)
      request.stream({ block: serialized })
    }

    node.syncer.onGossip.on(onGossip)

    request.onClose.on(() => {
      node.syncer.onGossip.off(onGossip)
    })
  },
)
