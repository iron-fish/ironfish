/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { UnsignedTransaction } from '../../../primitives/unsignedTransaction'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'
import { getAccount } from './utils'

export type GetAccountTransactionDescriptionsRequest = {
  unsignedTransaction: string
  account?: string
}

export type GetAccountTransactionDescriptionsResponse = {
  account: string
  mints: {
    assetId: string
    value: string
    transferOwnershipTo?: string
  }[]
  burns: {
    assetId: string
    value: string
  }[]
  receivedNotes: {
    assetId: string
    memo: string
    owner: string
    sender: string
    value: string
  }[]
  sentNotes: {
    assetId: string
    memo: string
    owner: string
    sender: string
    value: string
  }[]
}

export const GetAccountTransactionDescriptionsRequestSchema: yup.ObjectSchema<GetAccountTransactionDescriptionsRequest> =
  yup
    .object({
      account: yup.string().optional(),
      unsignedTransaction: yup.string().defined(),
    })
    .defined()

const UnsignedTransactionMintDescriptionSchema = yup
  .object({
    assetId: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

const UnsignedTransactionBurnDescriptionSchema = yup
  .object({
    assetId: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

const UnsignedTransactionNoteSchema = yup
  .object({
    assetId: yup.string().defined(),
    memo: yup.string().defined(),
    owner: yup.string().defined(),
    sender: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

export const GetAccountTransactionDescriptionsResponseSchema: yup.ObjectSchema<GetAccountTransactionDescriptionsResponse> =
  yup
    .object({
      account: yup.string().defined(),
      mints: yup.array(UnsignedTransactionMintDescriptionSchema).defined(),
      burns: yup.array(UnsignedTransactionBurnDescriptionSchema).defined(),
      sentNotes: yup.array(UnsignedTransactionNoteSchema).defined(),
      receivedNotes: yup.array(UnsignedTransactionNoteSchema).defined(),
    })
    .defined()

routes.register<
  typeof GetAccountTransactionDescriptionsRequestSchema,
  GetAccountTransactionDescriptionsResponse
>(
  `${ApiNamespace.wallet}/getAccountTransactionDescriptions`,
  GetAccountTransactionDescriptionsRequestSchema,
  (request, node): void => {
    AssertHasRpcContext(request, node, 'wallet')

    const account = getAccount(node.wallet, request.data.account)
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(request.data.unsignedTransaction, 'hex'),
    )
    const descriptions = unsignedTransaction.descriptions(
      account.incomingViewKey,
      account.outgoingViewKey,
    )

    request.end({
      account: account.name,
      mints: descriptions.mints.map((mint) => ({
        assetId: mint.assetId,
        value: mint.value.toString(),
      })),
      burns: descriptions.burns.map((burn) => ({
        assetId: burn.assetId,
        value: burn.value.toString(),
      })),
      receivedNotes: descriptions.sentNotes.map((note) => ({
        assetId: note.assetId().toString('hex'),
        memo: note.memo().toString('hex'),
        owner: note.owner(),
        sender: note.sender(),
        value: note.value().toString(),
      })),
      sentNotes: descriptions.sentNotes.map((note) => ({
        assetId: note.assetId().toString('hex'),
        memo: note.memo().toString('hex'),
        owner: note.owner(),
        sender: note.sender(),
        value: note.value().toString(),
      })),
    })
  },
)
