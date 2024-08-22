/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'

// eslint-disable-next-line @typescript-eslint/ban-types
export type BlockNumberRequest = {} | undefined

export const BlockNumberRequestSchema: yup.ObjectSchema<BlockNumberRequest> = yup
  .object({})
  .notRequired()
  .default({})

export type BlockNumberResponse = {
  number: string
}

export const BlockNumberResponseSchema: yup.ObjectSchema<BlockNumberResponse> = yup
  .object({
    number: yup.string().defined(),
  })
  .defined()

registerEthRoute<typeof BlockNumberRequestSchema, BlockNumberResponse>(
  `eth_blockNumber`,
  `${ApiNamespace.eth}/blockNumber`,
  BlockNumberRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    request.end({
      number: '0x' + node.chain.head.sequence.toString(16),
    })
  },
)
