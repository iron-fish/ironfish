/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'

export type EstimateGasRequest = [
  {
    from?: string
    to: string
    gas?: string
    gasPrice?: string
    value?: string
    data?: string
  },
]

export const EstimateGasRequestSchema: yup.MixedSchema<EstimateGasRequest> = yup
  .mixed<EstimateGasRequest>()
  .defined()

export type EstimateGasResponse = string

export const EstimateGasResponseSchema: yup.StringSchema<EstimateGasResponse> = yup
  .string()
  .defined()

registerEthRoute<typeof EstimateGasRequestSchema, EstimateGasResponse>(
  `eth_estimateGas`,
  `${ApiNamespace.eth}/estimateGas`,
  EstimateGasRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)
    // TODO provide real gas estimation
    request.end('0x0')
  },
)
