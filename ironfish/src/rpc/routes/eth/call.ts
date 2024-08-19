/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { EthUtils } from '../../../utils/eth'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

// NOTE: from/nonce are not used in call RPC, but this matches spec from ETH
export type EthCallRequest = {
  input: string
  to: string
  from?: string
  gasLimit?: string
  gasPrice?: string
  value?: string
  nonce?: string
}

export type EthCallResponse = {
  result: string
}

export const EthCallRequestSchema: yup.ObjectSchema<EthCallRequest> = yup
  .object({
    input: yup.string().defined(),
    to: yup.string().defined(),
    from: yup.string().optional(),
    gasLimit: yup.string().optional(),
    gasPrice: yup.string().optional(),
    value: yup.string().optional(),
    nonce: yup.string().optional(),
  })
  .defined()

export const EthCallResponseSchema: yup.ObjectSchema<EthCallResponse> = yup
  .object({
    result: yup.string().defined(),
  })
  .defined()

routes.register<typeof EthCallRequestSchema, EthCallResponse>(
  `${ApiNamespace.eth}/call`,
  EthCallRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const gasLimit = request.data.gasLimit ? BigInt(request.data.gasLimit) : 1000000n
    const gasPrice = request.data.gasPrice ? BigInt(request.data.gasPrice) : 0n
    const value = request.data.value ? BigInt(request.data.value) : undefined

    const result = await node.chain.evm.call({
      to: Address.fromString(EthUtils.prefix0x(request.data.to)),
      data: Buffer.from(request.data.input.slice(2), 'hex'),
      gasLimit,
      gasPrice,
      value,
    })

    if (result.execResult.exceptionError) {
      throw new Error(result.execResult.exceptionError.error)
    }

    request.end({
      result: Buffer.from(result.execResult.returnValue).toString('hex'),
    })
  },
)
