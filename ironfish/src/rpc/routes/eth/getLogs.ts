/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bytesToHex } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { BlockHeader } from '../../../primitives'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { EthUtils } from '../../../utils'
import { RpcNotFoundError, RpcValidationError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'
import { EthRpcLog, EthRpcLogSchema } from './types'
import { blockNumberToBlockHeader, getEthRpcLogs } from './util'

export type GetLogsRequest = {
  fromBlock?: string
  toBlock?: string
  address?: string
  topics?: string[]
  blockHash?: string
}

export const GetLogsRequestSchema: yup.ObjectSchema<GetLogsRequest> = yup
  .object({
    fromBlock: yup.string().optional().default('latest'),
    toBlock: yup.string().optional().default('latest'),
    address: yup.string().optional(),
    topics: yup.array().of(yup.string().defined()).optional(),
    blockHash: yup.string().optional(),
  })
  .defined()

export type GetLogsResponse = EthRpcLog[]

export const GetLogsResponseSchema: yup.ArraySchema<EthRpcLog> = yup
  .array(EthRpcLogSchema.defined())
  .defined()

registerEthRoute<typeof GetLogsRequestSchema, GetLogsResponse>(
  `eth_getLogs`,
  `${ApiNamespace.eth}/getLogs`,
  GetLogsRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const logs: EthRpcLog[] = []

    let fromBlock: BlockHeader
    let toBlock: BlockHeader
    if (request.data.blockHash) {
      const header = await node.chain.getHeader(
        Buffer.from(EthUtils.remove0x(request.data.blockHash), 'hex'),
      )

      if (!header) {
        throw new RpcNotFoundError(`No block found with hash ${request.data.blockHash}`)
      }

      fromBlock = header
      toBlock = header
    } else {
      if (!request.data.fromBlock) {
        throw new RpcValidationError(`Missing parameter 'fromBlock'`)
      }
      const from = await blockNumberToBlockHeader(request.data.fromBlock, node.chain)

      if (!from) {
        throw new RpcNotFoundError(`No block found for 'fromBlock' ${request.data.fromBlock}`)
      }

      if (!request.data.toBlock) {
        throw new RpcValidationError(`Missing parameter 'toBlock'`)
      }
      const to = await blockNumberToBlockHeader(request.data.toBlock, node.chain)

      if (!to) {
        throw new RpcNotFoundError(`No block found for 'toBlock' ${request.data.toBlock}`)
      }

      fromBlock = from
      toBlock = to
    }

    for await (const header of node.chain.iterateBlockHeaders(fromBlock.hash, toBlock.hash)) {
      const transactions = await node.chain.getBlockTransactions(header)

      for (const [index, transaction] of transactions.entries()) {
        if (!transaction.transaction.evm) {
          continue
        }

        const evmTx = evmDescriptionToLegacyTransaction(transaction.transaction.evm)
        const receipt = await node.chain.blockchainDb.getEvmReceipt(Buffer.from(evmTx.hash()))

        if (!receipt) {
          throw new RpcNotFoundError(
            `Missing transaction receipt for transaction ${bytesToHex(evmTx.hash())}`,
          )
        }

        const txLogs = getEthRpcLogs(transaction.transaction, header, index, receipt)

        logs.push(...filterLogs(txLogs, request.data.address, request.data.topics))
      }
    }

    request.end(logs)
  },
)

function filterLogs(logs: EthRpcLog[], address?: string, topics?: string[]): EthRpcLog[] {
  return logs.filter((log) => {
    let include = true
    if (address) {
      include = log.address === address
    }

    if (topics) {
      if (topics.length > log.topics.length) {
        include = false
      } else {
        for (const [index, filterTopic] of topics.entries()) {
          include = log.topics[index] === filterTopic
        }
      }
    }

    return include
  })
}
