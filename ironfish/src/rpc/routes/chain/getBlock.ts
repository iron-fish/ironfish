/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { getBlockSize, getTransactionSize } from '../../../network/utils/serializers'
import { FullNode } from '../../../node'
import { BlockHeader } from '../../../primitives'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives/block'
import { BufferUtils } from '../../../utils'
import { NotFoundError, ValidationError } from '../../adapters'
import { RpcBlock, RpcBlockSchema, serializeRpcBlockHeader } from '../../types'
import { ApiNamespace, routes } from '../router'

export type GetBlockRequest = {
  search?: string
  hash?: string
  sequence?: number
  confirmations?: number
  serialized?: boolean
}

export type GetBlockResponse = {
  block: RpcBlock
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
    serialized: yup.boolean().optional(),
  })
  .defined()

export const GetBlockResponseSchema: yup.ObjectSchema<GetBlockResponse> = yup
  .object({
    block: RpcBlockSchema.defined(),
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
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

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
      throw new NotFoundError(error)
    }

    if (header.noteSize === null) {
      throw new ValidationError('Block header was saved to database without a note size')
    }

    const block = await node.chain.getBlock(header)
    if (!block) {
      throw new NotFoundError(`No block with header ${header.hash.toString('hex')}`)
    }

    const transactions: GetBlockResponse['block']['transactions'] = []

    for (const tx of block.transactions) {
      transactions.push({
        serialized: tx.serialize().toString('hex'),
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
      })
    }

    const main = await node.chain.isHeadChain(header)
    const confirmed = node.chain.head.sequence - header.sequence >= confirmations

    const blockHeaderResponse = serializeRpcBlockHeader(header)

    request.end({
      block: {
        ...blockHeaderResponse,
        size: getBlockSize(block),
        transactions,
      },
      metadata: {
        main: main,
        confirmed: confirmed,
      },
    })
  },
)
