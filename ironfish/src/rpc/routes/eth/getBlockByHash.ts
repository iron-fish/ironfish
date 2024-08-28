/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Block } from '../../../primitives'
import { EthUtils } from '../../../utils'
import { RpcNotFoundError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'
import {
  ethBlockResponse,
  GetBlockByNumberRequest,
  GetBlockByNumberRequestSchema,
  GetBlockByNumberResponse,
  GetBlockByNumberResponseSchema,
} from './getBlockByNumber'

export type GetBlockByHashRequest = GetBlockByNumberRequest

export const GetBlockByHashRequestSchema = GetBlockByNumberRequestSchema

export type GetBlockByHashResponse = GetBlockByNumberResponse

export const GetBlockByHashResponseSchema = GetBlockByNumberResponseSchema

registerEthRoute<typeof GetBlockByHashRequestSchema, GetBlockByHashResponse>(
  `eth_getBlockByHash`,
  `${ApiNamespace.eth}/getBlockByHash`,
  GetBlockByHashRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [hash, transactionDetailFlag] = request.data

    const block: Block | null = await node.chain.getBlock(
      Buffer.from(EthUtils.remove0x(hash), 'hex'),
    )
    if (!block) {
      throw new RpcNotFoundError(`Block with hash "${hash}" not found`)
    }
    request.end(ethBlockResponse(block, transactionDetailFlag))
  },
)
