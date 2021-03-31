/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockTransactionRequest, BlockTransactionResponse } from '../types'
import { RequestHandlerParams } from '../middleware'
import { isValidNetworkIdentifier } from '../utils/networkIdentifierUtil'
import { getCustomRepository } from 'typeorm'
import { TransactionRepository } from '../repository/TransactionRepository'

export const BlockTransaction = async (
  requestParams: RequestHandlerParams<BlockTransactionRequest>,
): Promise<BlockTransactionResponse> => {
  const { params } = requestParams
  const {
    block_identifier: blockIdentifier,
    network_identifier: networkIdentifier,
    transaction_identifier: transactionIdentifier,
  } = params

  // Verify network identifier
  if (!isValidNetworkIdentifier(networkIdentifier))
    throw new Error(`Network identifier is not valid`)

  const transactionRepository = getCustomRepository(TransactionRepository)
  const transactionData = await transactionRepository.findWithInstances(
    transactionIdentifier.hash,
    blockIdentifier.hash,
  )

  if (!transactionData) throw new Error(`Transaction data not found`)

  const response: BlockTransactionResponse = {
    transaction: {
      transaction_identifier: {
        hash: transactionData.hash,
      },
      operations: [],
      metadata: {
        timestamp: transactionData.block.timestamp,
        notes: transactionData.notes,
        spends: transactionData.spends,
        size: transactionData.size,
        fee: transactionData.fee,
        isMinerFee: transactionData.fee < 0 && transactionData.block.sequence > 1,
      },
    },
  }

  return Promise.resolve(response)
}
