/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bytesToHex } from '@ethereumjs/util'
import { EvmReceiptValue } from '../../../blockchain/database/evmReceiptValue'
import { BlockHeader, Transaction } from '../../../primitives'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { EthUtils } from '../../../utils'
import { EthRpcLog, EthRpcTransaction } from './types'

export function blockTransactionToEthRpcTransaction(
  transaction: Transaction,
  blockHeader: BlockHeader,
  index: number,
): EthRpcTransaction {
  if (!transaction.evm) {
    throw new Error('Transaction does not have EVM description')
  }
  const ethTransaction = evmDescriptionToLegacyTransaction(transaction.evm)

  return {
    blockHash: EthUtils.prefix0x(blockHeader.hash.toString('hex')),
    blockNumber: EthUtils.numToHex(blockHeader.sequence),
    transactionIndex: EthUtils.numToHex(index),
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
  }
}

export function getEthRpcLogs(
  transaction: Transaction,
  blockHeader: BlockHeader,
  index: number,
  receipt: EvmReceiptValue,
): Array<EthRpcLog> {
  const logs = []

  if (!transaction.evm) {
    throw new Error('Transaction does not have EVM description')
  }
  const ethTransaction = evmDescriptionToLegacyTransaction(transaction.evm)
  const transactionHash = bytesToHex(ethTransaction.hash())
  const transactionIndex = EthUtils.numToHex(index)
  const blockNumber = EthUtils.numToHex(blockHeader.sequence)
  const blockHash = bytesToHex(blockHeader.hash)
  for (const [i, [address, topics, data]] of receipt.logs.entries()) {
    logs.push({
      address: bytesToHex(address),
      topics: topics.map(bytesToHex),
      data: bytesToHex(data),
      blockNumber,
      blockHash,
      transactionHash,
      transactionIndex,
      logIndex: EthUtils.numToHex(i),
      removed: false, // we delete receipts when disconnecting blocks
    })
  }

  return logs
}
