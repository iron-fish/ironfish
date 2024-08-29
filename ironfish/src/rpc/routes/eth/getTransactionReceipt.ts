/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bytesToHex } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { EthUtils } from '../../../utils'
import { RpcNotFoundError } from '../../adapters'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'
import { EthRpcLog, EthRpcLogSchema } from './types'
import { getEthRpcLogs } from './util'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetTransactionReceiptRequest = string

export const GetTransactionReceiptRequestSchema: yup.StringSchema<GetTransactionReceiptRequest> =
  yup.string().defined()

export type GetTransactionReceiptResponse = {
  transactionHash: string
  transactionIndex: string
  blockHash: string
  blockNumber: string
  from: string
  to: string | null
  cumulativeGasUsed: string
  effectiveGasPrice: string
  gasUsed: string
  contractAddress: string | null
  logs: EthRpcLog[]
  logsBloom: string
  type: string
  status: string
}

export const GetTransactionReceiptResponseSchema: yup.ObjectSchema<GetTransactionReceiptResponse> =
  yup
    .object({
      transactionHash: yup.string().defined(),
      transactionIndex: yup.string().defined(),
      blockHash: yup.string().defined(),
      blockNumber: yup.string().defined(),
      from: yup.string().defined(),
      to: yup.string().nullable().defined(),
      cumulativeGasUsed: yup.string().defined(),
      effectiveGasPrice: yup.string().defined(),
      gasUsed: yup.string().defined(),
      contractAddress: yup.string().nullable().defined(),
      logs: yup.array().of(EthRpcLogSchema.defined()).defined(),
      logsBloom: yup.string().defined(),
      type: yup.string().defined(),
      status: yup.string().defined(),
    })
    .defined()

registerEthRoute<typeof GetTransactionReceiptRequestSchema, GetTransactionReceiptResponse>(
  `eth_getTransactionReceipt`,
  `${ApiNamespace.eth}/getTransactionReceipt`,
  GetTransactionReceiptRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const evmTransactionHash = Buffer.from(EthUtils.remove0x(request.data), 'hex')

    const transactionHash =
      await node.chain.blockchainDb.getEthTransactionHashToTransactionHash(evmTransactionHash)
    if (!transactionHash) {
      throw new RpcNotFoundError(`Transaction ${request.data} not found`)
    }
    const blockHash = await node.chain.getBlockHashByTransactionHash(transactionHash)

    if (!blockHash) {
      throw new RpcNotFoundError(`Block not found for transaction ${request.data}`)
    }
    const blockHeader = await node.chain.getHeader(blockHash)
    if (!blockHeader) {
      throw new RpcNotFoundError(`Block header not found for transaction ${request.data}`)
    }
    const retrieved = await node.chain.getBlockTransaction(blockHeader, transactionHash)

    if (!retrieved) {
      throw new RpcNotFoundError(`Transaction ${request.data} not found`)
    }
    if (!retrieved.transaction.transaction.evm) {
      throw new RpcNotFoundError(`Transaction ${request.data} does not have EVM description`)
    }
    const ethTransaction = evmDescriptionToLegacyTransaction(
      retrieved.transaction.transaction.evm,
    )

    const evmReceipt = await node.chain.blockchainDb.getEvmReceipt(evmTransactionHash)
    if (!evmReceipt) {
      throw new RpcNotFoundError(
        `Transaction receipt not found for transaction ${request.data}`,
      )
    }

    request.end({
      transactionHash: EthUtils.prefix0x(Buffer.from(ethTransaction.hash()).toString('hex')),
      transactionIndex: EthUtils.numToHex(retrieved.index),
      blockHash: EthUtils.prefix0x(retrieved.transaction.blockHash.toString('hex')),
      blockNumber: EthUtils.numToHex(retrieved.transaction.sequence),
      from: ethTransaction.getSenderAddress().toString(),
      to: ethTransaction.to === undefined ? null : ethTransaction.to.toString(),
      cumulativeGasUsed: EthUtils.numToHex(evmReceipt.cumulativeGasUsed),
      // TODO: support effectiveGasPrice non-Legacy transactions
      effectiveGasPrice: EthUtils.numToHex(ethTransaction.gasPrice),
      gasUsed: EthUtils.numToHex(evmReceipt.gasUsed),
      contractAddress: evmReceipt.contractAddress
        ? bytesToHex(evmReceipt.contractAddress)
        : null,
      logs: getEthRpcLogs(
        retrieved.transaction.transaction,
        blockHeader,
        retrieved.index,
        evmReceipt,
      ),
      logsBloom: bytesToHex(evmReceipt.logsBloom),
      type: EthUtils.numToHex(ethTransaction.type),
      status: EthUtils.numToHex(evmReceipt.status),
    })
  },
)
