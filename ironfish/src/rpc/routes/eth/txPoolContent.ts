/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'

export type TxPoolContentRequest = unknown[]

export const TxPoolContentRequestSchema: yup.Schema<TxPoolContentRequest> = yup
  .array<TxPoolContentRequest>()
  .defined()

export type TxPoolContentResponse = unknown[]

export const TxPoolContentResponseSchema: yup.Schema<TxPoolContentResponse> = yup
  .array()
  .defined()

registerEthRoute<typeof TxPoolContentResponseSchema, TxPoolContentResponse>(
  `txpool_content`,
  `${ApiNamespace.eth}/txpoolContent`,
  TxPoolContentRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)
    // TODO implement tx pool content
    request.end([])
  },
)
