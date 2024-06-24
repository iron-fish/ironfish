/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHeader } from '../../../primitives'
import { RpcBlockHeader, RpcBlockHeaderSchema } from '../chain'
import { serializeRpcBlockHeader } from '../chain/serializers'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

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

routes.register<typeof OnReorganizeChainRequestSchema, OnReorganizeChainResponse>(
  `${ApiNamespace.event}/onReorganizeChain`,
  OnReorganizeChainRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

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
