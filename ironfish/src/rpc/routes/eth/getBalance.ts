/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHeader } from '../../../primitives'
import { RpcNotFoundError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'

export type EthGetBalanceRequest = {
  address: string
  blockNumber: string
}

export type EthGetBalanceResponse = string

export const EthGetBalanceRequestSchema: yup.ObjectSchema<EthGetBalanceRequest> = yup
  .object({
    address: yup.string().defined().trim(),
    blockNumber: yup.string().defined().trim(),
  })
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

    const address = Address.fromString(request.data.address)
    // TODO: latest, earliest, pending, safe or finalized in other chains, stubbing for now
    let header: BlockHeader | null
    if (request.data.blockNumber === 'latest') {
      header = node.chain.latest
    } else {
      const blockNumber = Number(request.data.blockNumber)
      header = await node.chain.getHeaderAtSequence(blockNumber)
    }
    if (!header || !header.stateCommitment) {
      throw new RpcNotFoundError(
        `No header/state commitment found with reference ${request.data.blockNumber}`,
      )
    }
    const stateRoot = header.stateCommitment
    const balance = await node.chain.evm.getBalance(address, stateRoot)
    if (!balance) {
      return request.end('0x0')
    }

    request.end(`0x${balance.toString(16)}`)
  },
)
