/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { GLOBAL_IF_ACCOUNT } from '../../../evm'
import { FullNode } from '../../../node'
import { legacyTransactionToEvmDescription } from '../../../primitives'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type SendRawTransactionRequest = {
  transaction: string
}

export type SendRawTransactionResponse = {
  hash: string
  ifHash: string
  accepted?: boolean
  broadcasted?: boolean
}

export const SendRawTransactionRequestSchema: yup.ObjectSchema<SendRawTransactionRequest> = yup
  .object({
    transaction: yup.string().defined().trim(),
  })
  .defined()

export const SendRawTransactionResponseSchema: yup.ObjectSchema<SendRawTransactionResponse> =
  yup
    .object({
      hash: yup.string().defined(),
      ifHash: yup.string().defined(),
      accepted: yup.boolean().optional(),
      broadcasted: yup.boolean().optional(),
    })
    .defined()

routes.register<typeof SendRawTransactionRequestSchema, SendRawTransactionResponse>(
  `${ApiNamespace.eth}/sendRawTransaction`,
  SendRawTransactionRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const bytes = Buffer.from(request.data.transaction, 'hex')
    const ethTransaction = LegacyTransaction.fromSerializedTx(bytes)
    const evmDescription = legacyTransactionToEvmDescription(ethTransaction)
    const raw = await node.wallet.createEvmTransaction({
      evm: evmDescription,
      evmEvents: [],
    })

    const transaction = await node.wallet.post({
      transaction: raw,
      spendingKey: GLOBAL_IF_ACCOUNT.spendingKey,
    })

    request.end({
      hash: Buffer.from(ethTransaction.hash()).toString('hex'),
      ifHash: transaction.transaction.hash().toString('hex'),
      accepted: transaction.accepted,
      broadcasted: transaction.broadcasted,
    })
  },
)
