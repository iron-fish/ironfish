/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'

export type DebugTraceTransactionRequest = [string]

export const DebugTraceTransactionRequestSchema: yup.MixedSchema<DebugTraceTransactionRequest> =
  yup.mixed<DebugTraceTransactionRequest>().defined()

export type DebugTraceTransactionRequestResponse = unknown

export const DebugTraceTransactionResponseSchema: yup.MixedSchema<DebugTraceTransactionRequestResponse> =
  yup.mixed().defined()

registerEthRoute<
  typeof DebugTraceTransactionRequestSchema,
  DebugTraceTransactionRequestResponse
>(
  `debug_traceTransaction`,
  `${ApiNamespace.eth}/debugTraceTransaction`,
  DebugTraceTransactionRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)
    // TODO implement
    // const [txHash] = request.data
    request.end({})
  },
)
