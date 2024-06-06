/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getBlockSize, getTransactionSize } from '../../../network/utils/serializers'
import { Block, BlockHeader, Transaction } from '../../../primitives'
import { BufferUtils } from '../../../utils'
import { RpcBlock, RpcBlockHeader, RpcTransaction } from './types'

export function serializeRpcBlockHeader(header: BlockHeader): RpcBlockHeader {
  return {
    hash: header.hash.toString('hex'),
    previous: header.previousBlockHash.toString('hex'),
    sequence: Number(header.sequence),
    previousBlockHash: header.previousBlockHash.toString('hex'),
    timestamp: header.timestamp.valueOf(),
    difficulty: header.target.toDifficulty().toString(),
    graffiti: header.graffiti.toString('hex'),
    noteCommitment: header.noteCommitment.toString('hex'),
    transactionCommitment: header.transactionCommitment.toString('hex'),
    target: header.target.asBigInt().toString(),
    randomness: header.randomness.toString(),
    work: header.work.toString(),
    noteSize: header.noteSize ?? null,
  }
}

export const serializeRpcBlock = (block: Block, serialized?: boolean): RpcBlock => {
  const blockHeaderResponse = serializeRpcBlockHeader(block.header)

  const transactions: RpcTransaction[] = []
  for (const tx of block.transactions) {
    transactions.push(serializeRpcTransaction(tx, serialized))
  }

  return {
    ...blockHeaderResponse,
    size: getBlockSize(block),
    transactions,
  }
}

export const serializeRpcTransaction = (
  tx: Transaction,
  serialized?: boolean,
): RpcTransaction => {
  return {
    hash: tx.hash().toString('hex'),
    size: getTransactionSize(tx),
    fee: Number(tx.fee()),
    expiration: tx.expiration(),
    notes: tx.notes.map((note) => ({
      commitment: note.hash().toString('hex'),
      hash: note.hash().toString('hex'),
      serialized: note.serialize().toString('hex'),
    })),
    spends: tx.spends.map((spend) => ({
      nullifier: spend.nullifier.toString('hex'),
      commitment: spend.commitment.toString('hex'),
      size: spend.size,
    })),
    mints: tx.mints.map((mint) => ({
      id: mint.asset.id().toString('hex'),
      metadata: BufferUtils.toHuman(mint.asset.metadata()),
      name: BufferUtils.toHuman(mint.asset.name()),
      creator: mint.asset.creator().toString('hex'),
      value: mint.value.toString(),
      transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
      assetId: mint.asset.id().toString('hex'),
      assetName: mint.asset.name().toString('hex'),
    })),
    burns: tx.burns.map((burn) => ({
      id: burn.assetId.toString('hex'),
      value: burn.value.toString(),
      assetId: burn.assetId.toString('hex'),
      assetName: '',
    })),
    signature: tx.transactionSignature().toString('hex'),
    ...(serialized ? { serialized: tx.serialize().toString('hex') } : {}),
  }
}
