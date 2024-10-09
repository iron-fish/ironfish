/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { FullNode } from '../../../node'
import { Block } from '../../../primitives/block'
import { BlockHeader } from '../../../primitives/blockheader'
import { BufferUtils, CurrencyUtils } from '../../../utils'
import { PromiseUtils } from '../../../utils/promise'
import { isValidIncomingViewKey, isValidOutgoingViewKey } from '../../../wallet/validator'
import { RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { serializeRpcBlockHeader } from './serializers'
import {
  RpcBlockHeader,
  RpcBlockHeaderSchema,
  RpcBurn,
  RpcBurnSchema,
  RpcMint,
  RpcMintSchema,
} from './types'

interface Note {
  assetId: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
  hash: string
  value: string
  memo: string
  sender: string
}

interface Transaction {
  hash: string
  isMinersFee: boolean
  notes: Note[]
  mints: RpcMint[]
  burns: RpcBurn[]
}

const NoteSchema = yup
  .object()
  .shape({
    assetId: yup.string().required(),
    assetName: yup.string().required(),
    hash: yup.string().required(),
    value: yup.string().required(),
    memo: yup.string().required(),
    sender: yup.string().required(),
  })
  .required()

const TransactionSchema = yup
  .object()
  .shape({
    hash: yup.string().required(),
    isMinersFee: yup.boolean().required(),
    notes: yup.array().of(NoteSchema).required(),
    mints: yup.array().of(RpcMintSchema).required(),
    burns: yup.array().of(RpcBurnSchema).required(),
  })
  .required()

export type GetTransactionStreamRequest = {
  incomingViewKey: string
  outgoingViewKey?: string
  head?: string | null
  memoAsHex?: boolean
}

export type GetTransactionStreamResponse = {
  type: 'connected' | 'disconnected' | 'fork'
  head: {
    sequence: number
  }
  block: RpcBlockHeader
  transactions: Transaction[]
}

export const GetTransactionStreamRequestSchema: yup.ObjectSchema<GetTransactionStreamRequest> =
  yup
    .object({
      incomingViewKey: yup.string().required(),
      outgoingViewKey: yup.string().optional(),
      head: yup.string().nullable().optional(),
      memoAsHex: yup.boolean().optional().default(false),
    })
    .required()
export const GetTransactionStreamResponseSchema: yup.ObjectSchema<GetTransactionStreamResponse> =
  yup
    .object({
      transactions: yup.array().of(TransactionSchema).required(),
      type: yup.string().oneOf(['connected', 'disconnected', 'fork']).required(),
      block: RpcBlockHeaderSchema.defined(),
      head: yup
        .object({
          sequence: yup.number().required(),
        })
        .defined(),
    })
    .defined()

routes.register<typeof GetTransactionStreamRequestSchema, GetTransactionStreamResponse>(
  `${ApiNamespace.chain}/getTransactionStream`,
  GetTransactionStreamRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    if (!isValidIncomingViewKey(request.data.incomingViewKey)) {
      throw new RpcValidationError(`incomingViewKey is not valid`)
    }

    if (request.data.outgoingViewKey && !isValidOutgoingViewKey(request.data.outgoingViewKey)) {
      throw new RpcValidationError(`outgoingViewKey is not valid`)
    }

    const head = request.data.head ? Buffer.from(request.data.head, 'hex') : null

    if (head && !(await node.chain.hasBlock(head))) {
      throw new RpcValidationError(
        `Block with hash ${String(request.data.head)} was not found in the chain`,
      )
    }

    const processor = new ChainProcessor({
      chain: node.chain,
      logger: node.logger,
      head: head,
    })

    const processBlock = async (
      block: Block,
      type: 'connected' | 'disconnected' | 'fork',
    ): Promise<void> => {
      const transactions: Transaction[] = []

      for (const tx of block.transactions) {
        const notes = new Array<Note>()
        const mints = new Array<RpcMint>()
        const burns = new Array<RpcBurn>()

        for (const note of tx.notes) {
          let decryptedNote = note.decryptNoteForOwner(request.data.incomingViewKey)

          if (!decryptedNote && request.data.outgoingViewKey) {
            decryptedNote = note.decryptNoteForSpender(request.data.outgoingViewKey)
          }

          if (decryptedNote) {
            const memo = request.data.memoAsHex
              ? decryptedNote?.memo().toString('hex')
              : BufferUtils.toHuman(decryptedNote.memo())

            const assetValue = await node.chain.getAssetById(decryptedNote.assetId())
            notes.push({
              value: CurrencyUtils.encode(decryptedNote.value()),
              memo,
              assetId: decryptedNote.assetId().toString('hex'),
              assetName: assetValue?.name.toString('hex') || '',
              hash: decryptedNote.hash().toString('hex'),
              sender: decryptedNote.sender(),
            })
          }
        }

        for (const burn of tx.burns) {
          const assetValue = await node.chain.getAssetById(burn.assetId)
          burns.push({
            value: CurrencyUtils.encode(burn.value),
            id: burn.assetId.toString('hex'),
            assetId: burn.assetId.toString('hex'),
            assetName: assetValue?.name.toString('hex') || '',
          })
        }

        for (const mint of tx.mints) {
          mints.push({
            value: CurrencyUtils.encode(mint.value),
            assetId: mint.asset.id().toString('hex'),
            assetName: mint.asset.name().toString('hex'),
            id: mint.asset.id().toString('hex'),
            name: mint.asset.name().toString('hex'),
            creator: mint.asset.creator().toString('hex'),
            owner: mint.asset.creator().toString('hex'),
            metadata: mint.asset.metadata().toString('hex'),
            transferOwnershipTo: mint.transferOwnershipTo?.toString('hex'),
          })
        }

        if (notes.length || burns.length || mints.length) {
          transactions.push({
            hash: tx.hash().toString('hex'),
            isMinersFee: tx.isMinersFee(),
            notes: notes,
            burns: burns,
            mints: mints,
          })
        }
      }

      request.stream({
        type,
        transactions,
        block: serializeRpcBlockHeader(block.header),
        head: {
          sequence: node.chain.head.sequence,
        },
      })
    }

    const onAdd = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      await processBlock(block, 'connected')
    }

    const onRemove = async (header: BlockHeader) => {
      const block = await node.chain.getBlock(header)
      Assert.isNotNull(block)
      await processBlock(block, 'disconnected')
    }

    const onFork = async (block: Block) => {
      await processBlock(block, 'fork')
    }

    const abortController = new AbortController()

    processor.onAdd.on(onAdd)
    processor.onRemove.on(onRemove)
    node.chain.onForkBlock.on(onFork)

    request.onClose.on(() => {
      abortController.abort()
      processor.onAdd.off(onAdd)
      processor.onRemove.off(onRemove)
      node.chain.onForkBlock.off(onFork)
    })

    while (!request.closed) {
      await processor.update({ signal: abortController.signal })
      await PromiseUtils.sleep(1000)
    }

    request.end()
  },
)
