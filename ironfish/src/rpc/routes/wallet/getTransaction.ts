/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Note } from '../../../primitives/note'
import { CurrencyUtils } from '../../../utils'
import { ApiNamespace, router } from '../router'
import { RpcAccountDecryptedNote, serializeRpcAccountTransaction } from './types'
import { getAccount } from './utils'

export type GetAccountTransactionRequest = { account?: string; hash: string }

export type GetAccountTransactionResponse = {
  account: string
  transaction: {
    hash: string
    status: string
    type: string
    fee: string
    blockHash?: string
    blockSequence?: number
    notesCount: number
    spendsCount: number
    mintsCount: number
    burnsCount: number
    timestamp: number
    notes: RpcAccountDecryptedNote[]
    assetBalanceDeltas: Array<{ assetId: string; delta: string }>
  } | null
}

export const GetAccountTransactionRequestSchema: yup.ObjectSchema<GetAccountTransactionRequest> =
  yup
    .object({
      account: yup.string().strip(true),
      hash: yup.string().defined(),
    })
    .defined()

export const GetAccountTransactionResponseSchema: yup.ObjectSchema<GetAccountTransactionResponse> =
  yup
    .object({
      account: yup.string().defined(),
      transaction: yup
        .object({
          hash: yup.string().required(),
          status: yup.string().defined(),
          type: yup.string().defined(),
          fee: yup.string().defined(),
          blockHash: yup.string().optional(),
          blockSequence: yup.number().optional(),
          notesCount: yup.number().defined(),
          spendsCount: yup.number().defined(),
          mintsCount: yup.number().defined(),
          burnsCount: yup.number().defined(),
          timestamp: yup.number().defined(),
          notes: yup
            .array(
              yup
                .object({
                  owner: yup.boolean().defined(),
                  value: yup.string().defined(),
                  assetId: yup.string().defined(),
                  assetName: yup.string().defined(),
                  sender: yup.string().defined(),
                  memo: yup.string().trim().defined(),
                  spent: yup.boolean(),
                })
                .defined(),
            )
            .defined(),
          assetBalanceDeltas: yup
            .array(
              yup
                .object({
                  assetId: yup.string().defined(),
                  delta: yup.string().defined(),
                })
                .defined(),
            )
            .defined(),
        })
        .defined(),
    })
    .defined()

router.register<typeof GetAccountTransactionRequestSchema, GetAccountTransactionResponse>(
  `${ApiNamespace.wallet}/getAccountTransaction`,
  GetAccountTransactionRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)

    const transactionHash = Buffer.from(request.data.hash, 'hex')

    const transaction = await account.getTransaction(transactionHash)

    if (!transaction) {
      return request.end({
        account: account.name,
        transaction: null,
      })
    }

    const notesByAccount = await node.wallet.decryptNotes(transaction.transaction, null, [
      account,
    ])
    const notes = notesByAccount.get(account.id) ?? []

    const serializedNotes: RpcAccountDecryptedNote[] = []
    for await (const decryptedNote of notes) {
      const noteHash = decryptedNote.hash
      const decryptedNoteForOwner = await account.getDecryptedNote(noteHash)

      const owner = !!decryptedNoteForOwner
      const spent = decryptedNoteForOwner ? decryptedNoteForOwner.spent : false
      const note = decryptedNoteForOwner
        ? decryptedNoteForOwner.note
        : new Note(decryptedNote.serializedNote)

      const asset = await node.chain.getAssetById(note.assetId())

      serializedNotes.push({
        owner,
        memo: note.memo(),
        value: CurrencyUtils.encode(note.value()),
        assetId: note.assetId().toString('hex'),
        assetName: asset?.name.toString('hex') || '',
        sender: note.sender(),
        spent: spent,
      })
    }

    const serializedTransaction = serializeRpcAccountTransaction(transaction)

    const status = await node.wallet.getTransactionStatus(account, transaction)
    const type = await node.wallet.getTransactionType(account, transaction)

    const serialized = {
      ...serializedTransaction,
      notes: serializedNotes,
      status,
      type,
    }

    request.end({
      account: account.name,
      transaction: serialized,
    })
  },
)
