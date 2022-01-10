/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { GENESIS_BLOCK_SEQUENCE } from '../../../consensus'
import { BlockHeader } from '../../../primitives'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetBlockInfoRequest = {
  search?: string
  hash?: string
  sequence?: number
}

export type GetBlockInfoResponse = {
  block: {
    graffiti: string
    difficulty: string
    hash: string
    previousBlockHash: string
    sequence: number
    timestamp: number
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
  }
}

export const GetBlockInfoRequestSchema: yup.ObjectSchema<GetBlockInfoRequest> = yup
  .object()
  .shape({
    search: yup.string(),
    hash: yup.string(),
    sequence: yup.number(),
  })
  .defined()

export const GetBlockInfoResponseSchema: yup.ObjectSchema<GetBlockInfoResponse> = yup
  .object({
    block: yup
      .object({
        graffiti: yup.string().defined(),
        difficulty: yup.string().defined(),
        hash: yup.string().defined(),
        previousBlockHash: yup.string().defined(),
        sequence: yup.number().defined(),
        timestamp: yup.number().defined(),
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
      })
      .defined(),
  })
  .defined()

router.register<typeof GetBlockInfoRequestSchema, GetBlockInfoResponse>(
  `${ApiNamespace.chain}/getBlockInfo`,
  GetBlockInfoRequestSchema,
  async (request, node): Promise<void> => {
    let header: BlockHeader | null = null
    let error = ''

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

    const block = await node.chain.getBlock(header)
    if (!block) {
      throw new ValidationError(`No block with header ${header.hash.toString('hex')}`)
    }

    const transactions: GetBlockInfoResponse['block']['transactions'] = []

    await block.withTransactionReferences(async () => {
      for (const tx of block.transactions) {
        const fee = await tx.fee()

        transactions.push({
          signature: tx.transactionSignature().toString('hex'),
          hash: tx.hash().toString('hex'),
          fee: fee.toString(),
          spends: tx.spendsLength(),
          notes: tx.notesLength(),
        })
      }
    })

    const main = await node.chain.isHeadChain(header)

    request.status(200).end({
      block: {
        graffiti: header.graffiti.toString('hex'),
        difficulty: header.target.toDifficulty().toString(),
        hash: header.hash.toString('hex'),
        previousBlockHash: header.previousBlockHash.toString('hex'),
        sequence: Number(header.sequence),
        timestamp: header.timestamp.valueOf(),
        transactions: transactions,
      },
      metadata: {
        main: main,
      },
    })
  },
)
