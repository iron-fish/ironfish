/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ChainProcessor } from '../../../chainProcessor'
import { Block } from '../../../primitives/block'
import { BlockHeader } from '../../../primitives/blockheader'
import { CurrencyUtils } from '../../../utils'
import { PromiseUtils } from '../../../utils/promise'
import { isValidIncomingViewKey } from '../../../wallet/validator'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

interface Note {
  assetId: string
  assetName: string
  hash: string
  value: string
  memo: string
}
interface Mint {
  assetId: string
  assetName: string
  value: string
}
interface Burn {
  assetId: string
  assetName: string
  value: string
}

interface Transaction {
  hash: string
  isMinersFee: boolean
  notes: Note[]
  mints: Mint[]
  burns: Burn[]
}

const NoteSchema = yup
  .object()
  .shape({
    assetId: yup.string().required(),
    assetName: yup.string().required(),
    hash: yup.string().required(),
    value: yup.string().required(),
    memo: yup.string().required(),
  })
  .required()

const MintSchema = yup
  .object()
  .shape({
    assetId: yup.string().required(),
    assetName: yup.string().required(),
    value: yup.string().required(),
  })
  .required()

const BurnSchema = yup
  .object()
  .shape({
    assetId: yup.string().required(),
    assetName: yup.string().required(),
    value: yup.string().required(),
  })
  .required()

const TransactionSchema = yup
  .object()
  .shape({
    hash: yup.string().required(),
    isMinersFee: yup.boolean().required(),
    notes: yup.array().of(NoteSchema).required(),
    mints: yup.array().of(MintSchema).required(),
    burns: yup.array().of(BurnSchema).required(),
  })
  .required()

export type GetTransactionStreamRequest = { incomingViewKey: string; head?: string | null }

export type GetTransactionStreamResponse = {
  type: 'connected' | 'disconnected' | 'fork'
  head: {
    sequence: number
  }
  block: {
    hash: string
    previousBlockHash: string
    sequence: number
    timestamp: number
  }
  transactions: Transaction[]
}

export const GetTransactionStreamRequestSchema: yup.ObjectSchema<GetTransactionStreamRequest> =
  yup
    .object({
      incomingViewKey: yup.string().required(),
      head: yup.string().nullable().optional(),
    })
    .required()
export const GetTransactionStreamResponseSchema: yup.ObjectSchema<GetTransactionStreamResponse> =
  yup
    .object({
      transactions: yup.array().of(TransactionSchema).required(),
      type: yup.string().oneOf(['connected', 'disconnected', 'fork']).required(),
      block: yup
        .object({
          hash: yup.string().required(),
          sequence: yup.number().required(),
          timestamp: yup.number().required(),
          previousBlockHash: yup.string().required(),
        })
        .defined(),
      head: yup
        .object({
          sequence: yup.number().required(),
        })
        .defined(),
    })
    .defined()

router.register<typeof GetTransactionStreamRequestSchema, GetTransactionStreamResponse>(
  `${ApiNamespace.chain}/getTransactionStream`,
  GetTransactionStreamRequestSchema,
  async (request, node): Promise<void> => {
    if (!isValidIncomingViewKey(request.data.incomingViewKey)) {
      throw new ValidationError(`incomingViewKey is not valid`)
    }

    const head = request.data.head ? Buffer.from(request.data.head, 'hex') : null

    if (head && !(await node.chain.blockchainDb.hasBlock(head))) {
      throw new ValidationError(
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
        const mints = new Array<Mint>()
        const burns = new Array<Burn>()

        for (const note of tx.notes) {
          const decryptedNote = note.decryptNoteForOwner(request.data.incomingViewKey)

          if (decryptedNote) {
            const assetValue = await node.chain.getAssetById(decryptedNote.assetId())
            notes.push({
              value: CurrencyUtils.encode(decryptedNote.value()),
              memo: decryptedNote.memo(),
              assetId: decryptedNote.assetId().toString('hex'),
              assetName: assetValue?.name.toString('hex') || '',
              hash: decryptedNote.hash().toString('hex'),
            })
          }
        }

        for (const burn of tx.burns) {
          const assetValue = await node.chain.getAssetById(burn.assetId)
          burns.push({
            value: CurrencyUtils.encode(burn.value),
            assetId: burn.assetId.toString('hex'),
            assetName: assetValue?.name.toString('hex') || '',
          })
        }

        for (const mint of tx.mints) {
          mints.push({
            value: CurrencyUtils.encode(mint.value),
            assetId: mint.asset.id().toString('hex'),
            assetName: mint.asset.name().toString('hex'),
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
        block: {
          hash: block.header.hash.toString('hex'),
          sequence: block.header.sequence,
          timestamp: block.header.timestamp.valueOf(),
          previousBlockHash: block.header.previousBlockHash.toString('hex'),
        },
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
