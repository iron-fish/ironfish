/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bytesToHex } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize } from '../../../network/utils/serializers'
import { FullNode } from '../../../node'
import { Block } from '../../../primitives'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { EthUtils } from '../../../utils'
import { RpcNotFoundError } from '../../adapters'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'
import { EthRpcTransaction } from './types'
import { blockTransactionToEthRpcTransaction } from './util'

export type GetBlockByNumberRequest = [string, boolean]

export const GetBlockByNumberRequestSchema: yup.MixedSchema<GetBlockByNumberRequest> = yup
  .mixed<[string, boolean]>()
  .defined()

export type GetBlockByNumberResponse = {
  baseFeePerGas?: string
  difficulty: string
  extraData: string
  gasLimit: string
  gasUsed: string
  hash: string | null
  logsBloom: string | null
  miner: string
  mixHash: string
  nonce: string | null
  number: string | null
  parentHash: string
  receiptsRoot: string
  sha3Uncles: string
  size: string
  stateRoot: string
  timestamp: string
  totalDifficulty: string
  transactions: (string | EthRpcTransaction)[]
  transactionsRoot: string
  uncles: string[]
}

export const GetBlockByNumberResponseSchema: yup.ObjectSchema<GetBlockByNumberResponse> = yup
  .object({
    baseFeePerGas: yup.string().notRequired(),
    difficulty: yup.string().defined(),
    extraData: yup.string().defined(),
    gasLimit: yup.string().defined(),
    gasUsed: yup.string().defined(),
    hash: yup.string().nullable().defined(),
    logsBloom: yup.string().nullable().defined(),
    miner: yup.string().defined(),
    mixHash: yup.string().defined(),
    nonce: yup.string().nullable().defined(),
    number: yup.string().nullable().defined(),
    parentHash: yup.string().defined(),
    receiptsRoot: yup.string().defined(),
    sha3Uncles: yup.string().defined(),
    size: yup.string().defined(),
    stateRoot: yup.string().defined(),
    timestamp: yup.string().defined(),
    totalDifficulty: yup.string().defined(),
    transactions: yup.array<string | EthRpcTransaction>().defined(),
    transactionsRoot: yup.string().defined(),
    uncles: yup.array().of(yup.string().defined()).defined(),
  })
  .defined()

registerEthRoute<typeof GetBlockByNumberRequestSchema, GetBlockByNumberResponse>(
  `eth_getBlockByNumber`,
  `${ApiNamespace.eth}/getBlockByNumber`,
  GetBlockByNumberRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [blockNumber, transactionDetailFlag] = request.data

    const block: Block | null = await node.chain.getBlockAtSequence(parseInt(blockNumber))
    if (!block) {
      throw new RpcNotFoundError(`Block ${blockNumber} not found`)
    }

    request.end(ethBlockResponse(block, transactionDetailFlag))
  },
)

export const ethBlockResponse = (
  block: Block,
  transactionDetailFlag: boolean,
): GetBlockByNumberResponse => {
  const blockHeader = block.header
  const transactions: (string | EthRpcTransaction)[] = []
  let index = 0
  for (const transaction of block.transactions) {
    if (transaction.evm) {
      const txInfo = transactionDetailFlag
        ? blockTransactionToEthRpcTransaction(transaction, block.header, index)
        : bytesToHex(evmDescriptionToLegacyTransaction(transaction.evm).hash())
      transactions.push(txInfo)
    }
    index += 1
  }

  // TODO handle mocked fields
  return {
    baseFeePerGas: '0x0',
    difficulty: '0x0',
    extraData: '0x',
    gasLimit: '0x0',
    gasUsed: '0x0',
    hash: EthUtils.prefix0x(blockHeader.hash.toString('hex')),
    logsBloom: '0x',
    miner: '0x',
    mixHash: '0x',
    nonce: '0x',
    number: EthUtils.numToHex(blockHeader.sequence),
    parentHash: EthUtils.prefix0x(blockHeader.previousBlockHash.toString('hex')),
    receiptsRoot: '0x',
    sha3Uncles: '0x',
    size: EthUtils.numToHex(getBlockSize(block)),
    stateRoot: EthUtils.prefix0x(
      blockHeader.stateCommitment ? blockHeader.stateCommitment.toString('hex') : '0x',
    ),
    timestamp: EthUtils.numToHex(Math.floor(blockHeader.timestamp.getTime() / 1000)),
    totalDifficulty: EthUtils.numToHex(blockHeader.target.toDifficulty()),
    transactions,
    transactionsRoot: EthUtils.prefix0x(blockHeader.transactionCommitment.toString('hex')),
    uncles: [],
  }
}
