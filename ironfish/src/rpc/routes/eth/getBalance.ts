/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { EthUtils } from '../../../utils/eth'
import { RpcNotFoundError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'
import { ethBlockRefToHeader } from './util'

export type EthGetBalanceRequest = [string, string]

export type EthGetBalanceResponse = string

export const EthGetBalanceRequestSchema: yup.MixedSchema<EthGetBalanceRequest> = yup
  .mixed<[string, string]>()
  .defined()

export const EthGetBalanceResponseSchema: yup.StringSchema<EthGetBalanceResponse> = yup
  .string()
  .defined()

registerEthRoute<typeof EthGetBalanceRequestSchema, EthGetBalanceResponse>(
  'eth_getBalance',
  `${ApiNamespace.eth}/getBalance`,
  EthGetBalanceRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [addr, blockRef] = request.data
    const address = Address.fromString(addr)
    const header = await ethBlockRefToHeader(blockRef, node.chain)

    if (header?.sequence === 1 && !header.stateCommitment) {
      return request.end(`0x0`)
    }

    if (!header || !header.stateCommitment) {
      throw new RpcNotFoundError(`No header/state commitment found with reference ${blockRef}`)
    }

    const balance = await node.chain.evm.getBalance(address, header.stateCommitment)
    if (!balance) {
      return request.end('0x0')
    }

    request.end(EthUtils.numToHex(balance))
  },
)
