/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { BlockHeader } from '../../../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives/block'
import { BufferUtils } from '../../../utils'
import { ValidationError } from '../../adapters'
import { ApiNamespace, routes } from '../router'

export type GetBlockRequest = {
  search?: string
  hash?: string
  sequence?: number
  confirmations?: number
}

export type GetBlockResponse = {
  block: {
    graffiti: string
    difficulty: string
    hash: string
    previousBlockHash: string
    sequence: number
    timestamp: number
    noteSize: number
    noteCommitment: string
    transactions: Array<{
      fee: string
      hash: string
      signature: string
      notes: number
      spends: number
    }>
  }
  metadata: {
    main: boolean
    confirmed: boolean
  }
}

export const GetBlockRequestSchema: yup.ObjectSchema<GetBlockRequest> = yup
  .object()
  .shape({
    search: yup.string(),
    hash: yup.string(),
    sequence: yup.number(),
    confirmations: yup.number().min(0).optional(),
  })
  .defined()

export const GetBlockResponseSchema: yup.ObjectSchema<GetBlockResponse> = yup
  .object({
    block: yup
      .object({
        graffiti: yup.string().defined(),
        difficulty: yup.string().defined(),
        hash: yup.string().defined(),
        previousBlockHash: yup.string().defined(),
        sequence: yup.number().defined(),
        timestamp: yup.number().defined(),
        noteSize: yup.number().defined(),
        noteCommitment: yup.string().defined(),
        transactions: yup
          .array(
            yup
              .object({
                fee: yup.string().defined(),
                hash: yup.string().defined(),
                signature: yup.string().defined(),
                notes: yup.number().defined(),
                spends: yup.number().defined(),
              })
              .defined(),
          )
          .defined(),
      })
      .defined(),
    metadata: yup
      .object({
        main: yup.boolean().defined(),
        confirmed: yup.boolean().defined(),
      })
      .defined(),
  })
  .defined()

routes.register<typeof GetBlockRequestSchema, GetBlockResponse>(
  `${ApiNamespace.chain}/getBlock`,
  GetBlockRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    let header: BlockHeader | null = null
    let error = ''

    const confirmations = request.data.confirmations ?? node.config.get('confirmations')

    if (request.data.search) {
      const search = request.data.search.trim()
      const num = Number(search)

      if (Number.isInteger(num)) {
        request.data.sequence = num
      } else {
        request.data.hash = search
      }
    }

    // Use negative numbers to start from the head of the chain
    if (request.data.sequence && request.data.sequence < 0) {
      request.data.sequence = Math.max(
        node.chain.head.sequence + request.data.sequence + 1,
        GENESIS_BLOCK_SEQUENCE,
      )
    }

    if (request.data.hash) {
      const hash = Buffer.from(request.data.hash, 'hex')
      header = await node.chain.getHeader(hash)
      error = `No block found with hash ${request.data.hash}`
    }

    if (request.data.sequence && !header) {
      header = await node.chain.getHeaderAtSequence(request.data.sequence)
      error = `No block found with sequence ${request.data.sequence}`
    }

    if (!header) {
      throw new ValidationError(error)
    }

    if (header.noteSize === null) {
      throw new ValidationError('Block header was saved to database without a note size')
    }

    const block = await node.chain.getBlock(header)
    if (!block) {
      throw new ValidationError(`No block with header ${header.hash.toString('hex')}`)
    }

    const transactions: GetBlockResponse['block']['transactions'] = []

    for (const tx of block.transactions) {
      const fee = tx.fee()

      transactions.push({
        signature: tx.transactionSignature().toString('hex'),
        hash: tx.hash().toString('hex'),
        fee: fee.toString(),
        spends: tx.spends.length,
        notes: tx.notes.length,
      })
    }

    const main = await node.chain.isHeadChain(header)
    const confirmed = node.chain.head.sequence - header.sequence >= confirmations

    request.end({
      block: {
        graffiti: BufferUtils.toHuman(header.graffiti),
        difficulty: header.target.toDifficulty().toString(),
        hash: header.hash.toString('hex'),
        previousBlockHash: header.previousBlockHash.toString('hex'),
        sequence: Number(header.sequence),
        timestamp: header.timestamp.valueOf(),
        noteSize: header.noteSize,
        noteCommitment: header.noteCommitment.toString('hex'),
        transactions: transactions,
      },
      metadata: {
        main: main,
        confirmed: confirmed,
      },
    })
  },
)
