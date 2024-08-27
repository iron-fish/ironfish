/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Transaction } from '../../../primitives'
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
    const transactions = await node.chain.getBlockTransactions(blockHeader)

    let transaction:
      | {
          transaction: Transaction
          initialNoteIndex: number
          sequence: number
          blockHash: Buffer
          previousBlockHash: Buffer
          timestamp: Date
        }
      | undefined = undefined
    let transactionNum = 0
    for (const tx of transactions) {
      if (tx.transaction.hash().equals(transactionHash)) {
        transaction = tx
        break
      }
      transactionNum += 1
    }
    if (!transaction) {
      throw new RpcNotFoundError(`Transaction ${request.data} not found`)
    }
    if (!transaction.transaction.evm) {
      throw new RpcNotFoundError(`Transaction ${request.data} does not have EVM description`)
    }
    const ethTransaction = evmDescriptionToLegacyTransaction(transaction.transaction.evm)
    // TODO deal with items that are mocked
    request.end({
      blockHash: EthUtils.prefix0x(transaction.blockHash.toString('hex')),
      blockNumber: EthUtils.prefix0x(transaction.sequence.toString(16)),
      transactionIndex: EthUtils.prefix0x(transactionNum.toString(16)),
      from: ethTransaction.getSenderAddress().toString(),
      gas: EthUtils.prefix0x(ethTransaction.gasLimit.toString(16)),
      gasPrice: EthUtils.prefix0x(ethTransaction.gasPrice.toString(16)),
      maxFeePerGas: '0x',
      maxPriorityFeePerGas: '0x',
      hash: EthUtils.prefix0x(Buffer.from(ethTransaction.hash()).toString('hex')),
      input: EthUtils.prefix0x(Buffer.from(ethTransaction.data).toString('hex')),
      nonce: EthUtils.prefix0x(ethTransaction.nonce.toString(16)),
      to: ethTransaction.to === undefined ? null : ethTransaction.to.toString(),
      value: EthUtils.prefix0x(ethTransaction.value.toString(16)),
      type: EthUtils.prefix0x(ethTransaction.type.toString(16)),
      accessList: [],
      chainId: '0x42069',
      v: EthUtils.prefix0x(ethTransaction.v?.toString(16) ?? ''),
      r: EthUtils.prefix0x(ethTransaction.r?.toString(16) ?? ''),
      s: EthUtils.prefix0x(ethTransaction.s?.toString(16) ?? ''),
      yParity: '0x1',
    })
  },
)
