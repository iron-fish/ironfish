/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { BlockHeader } from '../../../primitives'
import { ApiNamespace, router } from '../router'
import { RpcBlockHeader, RpcBlockHeaderSchema, serializeRpcBlockHeader } from './types'

export type OnReorganizeChainRequest = undefined
export type OnReorganizeChainResponse = {
  oldHead: RpcBlockHeader
  newHead: RpcBlockHeader
  fork: RpcBlockHeader
}
export const OnReorganizeChainRequestSchema: yup.MixedSchema<OnReorganizeChainRequest> = yup
  .mixed()
  .oneOf([undefined] as const)

export const OnReorganizeChainResponseSchema: yup.ObjectSchema<OnReorganizeChainResponse> = yup
  .object({
    oldHead: RpcBlockHeaderSchema,
    newHead: RpcBlockHeaderSchema,
    fork: RpcBlockHeaderSchema,
  })
  .defined()

router.register<typeof OnReorganizeChainRequestSchema, OnReorganizeChainResponse>(
  `${ApiNamespace.event}/onReorganizeChain`,
  OnReorganizeChainRequestSchema,
  (request, { node }): void => {
    Assert.isNotUndefined(node)

    function onReorganizeChain(oldHead: BlockHeader, newHead: BlockHeader, fork: BlockHeader) {
      request.stream({
        oldHead: serializeRpcBlockHeader(oldHead),
        newHead: serializeRpcBlockHeader(newHead),
        fork: serializeRpcBlockHeader(fork),
      })
    }

    node.chain.onReorganize.on(onReorganizeChain)

    request.onClose.on(() => {
      node.chain.onReorganize.off(onReorganizeChain)
    })
  },
)
