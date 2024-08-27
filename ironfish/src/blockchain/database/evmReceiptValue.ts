/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { IDatabaseEncoding } from '../../storage/database/types'
import { Log } from '@ethereumjs/evm'
import { RunTxResult } from '@ethereumjs/vm'
import bufio from 'bufio'

export interface EvmReceiptValue {
  type: number
  status: number
  contractAddress?: Buffer
  logsBloom: Buffer
  logs: Log[]
  gasUsed: bigint
  cumulativeGasUsed: bigint

  // fields below are included in Geth serialization, but we may not need them

  // effectiveGasPrice: bigint
  // postState: Buffer
  // TxHash: Buffer
  // blobGasUsed: bigint
  // blobGasPrice: bigint
  // blockHash: Buffer
  // blockNumber: number
  // transactionIndex: number
}

export function runTxResultToEvmReceipt(result: RunTxResult): EvmReceiptValue {
  return {
    type: 0, // hardcoded for LegacyTransaction
    status: result.execResult.exceptionError !== undefined ? 0 : 1,
    contractAddress: result.createdAddress
      ? Buffer.from(result.createdAddress.bytes)
      : undefined,
    logsBloom: Buffer.from(result.receipt.bitvector),
    logs: result.receipt.logs ?? [],
    gasUsed: result.execResult.executionGasUsed,
    cumulativeGasUsed: result.receipt.cumulativeBlockGasUsed,
  }
}

export class EvmReceiptValueEncoding implements IDatabaseEncoding<EvmReceiptValue> {
  serialize(value: EvmReceiptValue): Buffer {
    const bw = bufio.write(this.getSize(value))

    let flags = 0
    flags |= Number(!!value.contractAddress) << 0

    bw.writeU8(flags)
    bw.writeU8(value.type)
    bw.writeU8(value.status)

    if (value.contractAddress) {
      bw.writeBytes(value.contractAddress)
    }

    bw.writeBytes(value.logsBloom)

    bw.writeU32(value.logs.length)
    for (const [address, topics, data] of value.logs) {
      bw.writeBytes(Buffer.from(address))
      bw.writeU32(topics.length)
      for (const topic of topics) {
        bw.writeBytes(Buffer.from(topic))
      }
      bw.writeVarBytes(Buffer.from(data))
    }

    bw.writeBigU64(value.gasUsed)
    bw.writeBigU64(value.cumulativeGasUsed)

    return bw.render()
  }

  deserialize(buffer: Buffer): EvmReceiptValue {
    const reader = bufio.read(buffer, true)
    const flags = reader.readU8()
    const type = reader.readU8()
    const status = reader.readU8()

    let contractAddress = undefined
    if (flags & (1 << 0)) {
      contractAddress = reader.readBytes(20)
    }

    const logsBloom = reader.readBytes(256)

    const logs = []
    const logsLength = reader.readU32()
    for (let i = 0; i < logsLength; i++) {
      const address = reader.readBytes(20)
      const topics = []
      const topicsLength = reader.readU32()
      for (let j = 0; j < topicsLength; j++) {
        const topic = reader.readBytes(32)
        topics.push(Uint8Array.from(topic))
      }
      const data = reader.readVarBytes()
      logs.push([Uint8Array.from(address), topics, Uint8Array.from(data)] as Log)
    }

    const gasUsed = reader.readBigU64()
    const cumulativeGasUsed = reader.readBigU64()

    return {
      type,
      status,
      contractAddress,
      logsBloom,
      logs,
      gasUsed,
      cumulativeGasUsed,
    }
  }

  getSize(value: EvmReceiptValue): number {
    let size = 1 // flags
    size += 1 // type
    size += 1 // status
    if (value.contractAddress) {
      size += 20
    }

    size += 256 // logsBloom bitvector

    size += 4 // logs length
    for (const [_, topics, data] of value.logs) {
      size += 20 // address
      size += 4 // topics length
      size += 32 * topics.length // topics
      size += bufio.sizeVarBytes(Buffer.from(data)) // data
    }

    size += 8 // gasUsed
    size += 8 // cumulativeGasUsed

    return size
  }
}
