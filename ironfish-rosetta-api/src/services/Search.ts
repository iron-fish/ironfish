/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  SearchBlocksRequest,
  SearchBlocksResponse,
  SearchTransactionsRequest,
  SearchTransactionsResponse,
} from '../types'
import { RequestHandlerParams } from '../middleware'
import { getCustomRepository, LessThan, Like } from 'typeorm'
import { isValidNetworkIdentifier } from '../utils/networkIdentifierUtil'
import { BlockRepository } from '../repository/BlockRepository'
import { TransactionRepository } from '../repository/TransactionRepository'

export const SearchBlocks = async (
  requestParams: RequestHandlerParams<SearchBlocksRequest>,
): Promise<SearchBlocksResponse> => {
  const { params } = requestParams
  const { query, limit, seek, network_identifier: networkIdentifier } = params

  // Verify network identifier
  if (!isValidNetworkIdentifier(networkIdentifier))
    throw new Error(`Network identifier is not valid`)

  // Search filters:
  // - by hash if the query has 4+ characters
  // - by sequence if the query is a number
  const where = []
  // we can't just use offset / limit since we are adding new blocks every 15s
  const seekSequence = seek && seek > 0 ? { sequence: LessThan(seek) } : {}
  if (query && query.length > 3) {
    where.push({ ...seekSequence, hash: Like('%' + query + '%') })
  }
  if (!Number.isNaN(Number(query))) {
    where.push({ sequence: Number(query) })
  }
  if (where.length <= 0) {
    where.push(seekSequence)
  }

  const blockRepository = getCustomRepository(BlockRepository)
  const blocksData = await blockRepository.find({
    where,
    order: { sequence: 'DESC' },
    take: limit,
  })

  const blocks = blocksData.map((block) => ({
    block_identifier: {
      index: block.sequence,
      hash: block.hash,
    },
    parent_block_identifier: { index: 0, hash: '' },
    transactions: [],
    timestamp: Number(block.timestamp),
    metadata: {
      size: block.size,
      difficulty: block.difficulty,
      transactionsCount: block.transactionsCount,
    },
  }))

  const nextOffset = blocks[blocks.length - 1]?.block_identifier.index

  const response: SearchBlocksResponse = {
    blocks,
    next_offset: nextOffset > 1 ? nextOffset : undefined,
  }

  return Promise.resolve(response)
}

export const SearchTransactions = async (
  requestParams: RequestHandlerParams<SearchTransactionsRequest>,
): Promise<SearchTransactionsResponse> => {
  const { params } = requestParams
  const {
    transaction_identifier: transactionIdentifier,
    network_identifier: networkIdentifier,
    limit,
  } = params

  // Verify network identifier
  if (!isValidNetworkIdentifier(networkIdentifier))
    throw new Error(`Network identifier is not valid`)

  if (!transactionIdentifier) throw new Error(`Transaction identifier is not valid`)

  const { hash } = transactionIdentifier

  if (!hash && hash.length <= 3) throw new Error(`Transaction identifier hash is not valid`)

  const transactionRepository = getCustomRepository(TransactionRepository)
  const transactionsData = await transactionRepository.findByHashWithInstances(hash, limit || 5)

  const transactions = transactionsData.map((transaction) => {
    return {
      block_identifier: {
        index: transaction.block.sequence,
        hash: transaction.block.hash,
      },
      transaction: {
        transaction_identifier: {
          hash: transaction.hash,
        },
        operations: [],
        metadata: {
          timestamp: transaction.block.timestamp,
          notes: transaction.notes,
          spends: transaction.spends,
          size: transaction.size,
          fee: transaction.fee,
          isMinerFee: transaction.fee < 0 && transaction.block.sequence > 1,
        },
      },
    }
  })

  const response: SearchTransactionsResponse = {
    transactions,
    total_count: transactions.length,
  }

  return Promise.resolve(response)
}
