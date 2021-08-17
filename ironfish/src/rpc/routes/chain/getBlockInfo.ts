/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters'
import { ApiNamespace, router } from '../router'

export type GetBlockInfoRequest = { hash: string }

export type GetBlockInfoResponse = {
  block: {
    graffiti: string
    hash: string
    previousBlockHash: string
    sequence: number
    timestamp: number
    transactions: Array<{
      transactionFee: string
      transactionHash: string
      transactionSignature: string
      notes: number
      spends: number
    }>
  }
}

export const GetBlockInfoRequestSchema: yup.ObjectSchema<GetBlockInfoRequest> = yup
  .object({
    hash: yup.string().defined(),
  })
  .defined()

export const GetBlockInfoResponseSchema: yup.ObjectSchema<GetBlockInfoResponse> = yup
  .object({
    block: yup
      .object({
        graffiti: yup.string().defined(),
        hash: yup.string().defined(),
        previousBlockHash: yup.string().defined(),
        sequence: yup.number().defined(),
        timestamp: yup.number().defined(),
        transactions: yup
          .array(
            yup
              .object({
                transactionFee: yup.string().defined(),
                transactionHash: yup.string().defined(),
                transactionSignature: yup.string().defined(),
                notes: yup.number().defined(),
                spends: yup.number().defined(),
              })
              .defined(),
          )
          .defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof GetBlockInfoRequestSchema, GetBlockInfoResponse>(
  `${ApiNamespace.chain}/getBlockInfo`,
  GetBlockInfoRequestSchema,
  async (request, node): Promise<void> => {
    const hash = Buffer.from(request.data.hash, 'hex')

    const header = await node.chain.getHeader(hash)
    if (!header) {
      throw new ValidationError(`No block with hash ${request.data.hash}`)
    }

    const block = await node.chain.getBlock(header)
    if (!block) {
      throw new ValidationError(`No block with hash ${request.data.hash}`)
    }

    const transactions: GetBlockInfoResponse['block']['transactions'] = []

    await block.withTransactionReferences(async () => {
      for (const tx of block.transactions) {
        const fee = await tx.transactionFee()

        transactions.push({
          transactionSignature: tx.transactionSignature().toString('hex'),
          transactionHash: tx.transactionHash().toString('hex'),
          transactionFee: fee.toString(),
          spends: tx.spendsLength(),
          notes: tx.notesLength(),
        })
      }
    })

    request.status(200).end({
      block: {
        graffiti: header.graffiti.toString('hex'),
        hash: request.data.hash,
        previousBlockHash: header.previousBlockHash.toString('hex'),
        sequence: Number(header.sequence),
        timestamp: header.timestamp.valueOf(),
        transactions: transactions,
      },
    })
  },
)
