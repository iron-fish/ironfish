/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockRequest, BlockResponse, Transaction } from '../types'
import { RequestHandlerParams } from '../middleware'
import { getCustomRepository } from 'typeorm'
import { isValidNetworkIdentifier } from '../utils/networkIdentifierUtil'
import { BlockRepository } from '../repository/BlockRepository'

export const Block = async (
  requestParams: RequestHandlerParams<BlockRequest>,
): Promise<BlockResponse> => {
  const { params } = requestParams
  const { block_identifier: blockIdentifier, network_identifier: networkIdentifier } = params

  // Verify network identifier
  if (!isValidNetworkIdentifier(networkIdentifier))
    throw new Error(`Network identifier is not valid`)

  // Verify partial blockIdentifier
  if (!blockIdentifier.hash && !blockIdentifier.index)
    throw new Error(`Block identifier is not valid`)

  const blockRepository = getCustomRepository(BlockRepository)

  const blockData = await blockRepository.findWithInstances(
    blockIdentifier.hash,
    blockIdentifier.index,
  )

  if (blockData === null) throw new Error(`Block data not found`)

  const transactions: Transaction[] = blockData.transactions.map((transaction) => ({
    transaction_identifier: {
      hash: transaction.hash,
    },
    operations: [],
    metadata: {
      notes: transaction.notes,
      spends: transaction.spends,
      size: transaction.size,
      fee: transaction.fee,
      isMinerFee: transaction.fee < 0 && blockData.sequence > 1,
    },
  }))

  const response: BlockResponse = {
    block: {
      block_identifier: {
        index: blockData.sequence,
        hash: blockData.hash,
      },
      parent_block_identifier: {
        index: blockData.previousBlock?.sequence || 0,
        hash: blockData.previousBlock?.hash || '',
      },
      timestamp: Number(blockData.timestamp),
      transactions,
      metadata: {
        size: blockData.size,
        difficulty: blockData.difficulty,
      },
    },
  }

  return Promise.resolve(response)
}
