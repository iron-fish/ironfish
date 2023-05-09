/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Transaction } from '../../../primitives'
import { ApiNamespace, router } from '../router'

// eslint-disable-next-line @typescript-eslint/ban-types
export type FollowMempoolTransactionStreamRequest = {} | undefined

export type FollowMempoolTransactionStreamResponse = {
  serializedTransaction: string
}

export const FollowMempoolTransactionStreamRequestSchema: yup.ObjectSchema<FollowMempoolTransactionStreamRequest> =
  yup.object({}).notRequired().default({})

export const FollowMempoolTransactionStreamResponseSchema: yup.ObjectSchema<FollowMempoolTransactionStreamResponse> =
  yup
    .object({
      serializedTransaction: yup.string().defined(),
    })
    .defined()

router.register<
  typeof FollowMempoolTransactionStreamRequestSchema,
  FollowMempoolTransactionStreamResponse
>(
  `${ApiNamespace.mempool}/followTransactionStream`,
  FollowMempoolTransactionStreamRequestSchema,
  (request, node): void => {
    const onAdd = (transaction: Transaction) => {
      request.stream({
        serializedTransaction: transaction.serialize().toString('hex'),
      })
    }

    node.memPool.onAdd.on(onAdd)

    request.onClose.on(() => {
      node.memPool.onAdd.off(onAdd)
    })
  },
)
