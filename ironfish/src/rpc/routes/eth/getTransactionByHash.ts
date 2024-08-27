/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { EthUtils } from '../../../utils'
import { RpcNotFoundError } from '../../adapters'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'

// eslint-disable-next-line @typescript-eslint/ban-types
export type GetTransactionByHashRequest = string

export const GetTransactionByHashRequestSchema: yup.StringSchema<GetTransactionByHashRequest> =
  yup.string().defined()

export type GetTransactionByHashResponse = {
  blockHash: string
  blockNumber: string
  from: string
  gas: string
  gasPrice: string
  maxFeePerGas: string
  maxPriorityFeePerGas: string
  hash: string
  input: string
  nonce: string
  to: string | null
  transactionIndex: string
  value: string
  type: string
  accessList: string[]
  chainId: string
  v: string
  r: string
  s: string
  yParity: string
}

export const GetTransactionByHashResponseSchema: yup.ObjectSchema<GetTransactionByHashResponse> =
  yup
    .object({
      blockHash: yup.string().defined(),
      blockNumber: yup.string().defined(),
      from: yup.string().defined(),
      gas: yup.string().defined(),
      gasPrice: yup.string().defined(),
      maxFeePerGas: yup.string().defined(),
      maxPriorityFeePerGas: yup.string().defined(),
      hash: yup.string().defined(),
      input: yup.string().defined(),
      nonce: yup.string().defined(),
      to: yup.string().nullable().defined(),
      transactionIndex: yup.string().defined(),
      value: yup.string().defined(),
      type: yup.string().defined(),
      accessList: yup.array().of(yup.string().defined()).defined(),
      chainId: yup.string().defined(),
      v: yup.string().defined(),
      r: yup.string().defined(),
      s: yup.string().defined(),
      yParity: yup.string().defined(),
    })
    .defined()

registerEthRoute<typeof GetTransactionByHashRequestSchema, GetTransactionByHashResponse>(
  `eth_getTransactionByHash`,
  `${ApiNamespace.eth}/getTransactionByHash`,
  GetTransactionByHashRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)
    const transactionHash =
      await node.chain.blockchainDb.getEthTransactionHashToTransactionHash(
        Buffer.from(EthUtils.remove0x(request.data), 'hex'),
      )
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

    // TODO deal with items that are mocked
    request.end({
      blockHash: EthUtils.prefix0x(retrieved.transaction.blockHash.toString('hex')),
      blockNumber: EthUtils.numToHex(retrieved.transaction.sequence),
      transactionIndex: EthUtils.numToHex(retrieved.index),
      from: ethTransaction.getSenderAddress().toString(),
      gas: EthUtils.numToHex(ethTransaction.gasLimit),
      gasPrice: EthUtils.numToHex(ethTransaction.gasPrice),
      maxFeePerGas: '0x',
      maxPriorityFeePerGas: '0x',
      hash: EthUtils.prefix0x(Buffer.from(ethTransaction.hash()).toString('hex')),
      input: EthUtils.prefix0x(Buffer.from(ethTransaction.data).toString('hex')),
      nonce: EthUtils.numToHex(ethTransaction.nonce),
      to: ethTransaction.to === undefined ? null : ethTransaction.to.toString(),
      value: EthUtils.numToHex(ethTransaction.value),
      type: EthUtils.numToHex(ethTransaction.type),
      accessList: [],
      chainId: '0x42069',
      v: EthUtils.numToHex(ethTransaction.v ?? 0),
      r: EthUtils.numToHex(ethTransaction.r ?? 0),
      s: EthUtils.numToHex(ethTransaction.s ?? 0),
      yParity: '0x1',
    })
  },
)
