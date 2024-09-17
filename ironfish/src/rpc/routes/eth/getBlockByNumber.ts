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
import { blockTransactionToEthRpcTransaction, ethBlockRefToBlock } from './util'

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

    const block = await ethBlockRefToBlock(blockNumber, node.chain)

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
    //mocked
    extraData: '0xe4b883e5bda9e7a59ee4bb99e9b1bc000921',
    gasLimit: '0x0',
    gasUsed: '0x0',
    hash: EthUtils.prefix0x(blockHeader.hash.toString('hex')),
    // mocked
    logsBloom:
      '0x00af00124b82093253a6960ab5a003170000318c0a00c18d418505009c10c905810e05d4a4511044b6245a062122010233958626c80039250781851410a468418101040c0100f178088a4e89000140e00001880c1c601413ac47bc5882854701180b9404422202202521584000808843030a552488a80e60c804c8d8004d0480422585320e068028d2e190508130022600024a51c116151a07612040081000088ba5c891064920a846b36288a40280820212b20940280056b233060818988945f33460426105024024040923447ad1102000028b8f0e001e810021031840a2801831a0113b003a5485843004c10c4c10d6a04060a84d88500038ab10875a382c',
    // mocked
    miner: '0x829bd824b016326a401d083b33d092293333a830',
    //mocked
    mixHash: '0x7d416c4a24dc3b43898040ea788922d8563d44a5193e6c4a1d9c70990775c879',
    //mocked
    nonce: '0x7bb9369dcbaec019',
    number: EthUtils.numToHex(EthUtils.ifToEthSequence(blockHeader.sequence)),
    parentHash: EthUtils.prefix0x(blockHeader.previousBlockHash.toString('hex')),
    //mocked
    receiptsRoot: '0x7eadd994da137c7720fe2bf2935220409ed23a06ec6470ffd2d478e41af0255b',
    //mocked
    sha3Uncles: '0x7d9ce61d799ddcb5dfe1644ec7224ae7018f24ecb682f077b4c477da192e8553',
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
