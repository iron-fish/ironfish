/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import LRU from 'blru'
import { BufferMap } from 'buffer-map'
import * as yup from 'yup'
import { Transaction } from '../../../primitives'
import { ApiNamespace, router } from '../router'

// eslint-disable-next-line @typescript-eslint/ban-types
export type OnTransactionGossipRequest = {} | undefined

export type OnTransactionGossipResponse = {
  serializedTransaction: string
}

export const OnTransactionGossipRequestSchema: yup.ObjectSchema<OnTransactionGossipRequest> =
  yup.object({}).notRequired().default({})

export const OnTransactionGossipResponseSchema: yup.ObjectSchema<OnTransactionGossipResponse> =
  yup
    .object({
      serializedTransaction: yup.string().defined(),
    })
    .defined()

router.register<typeof OnTransactionGossipRequestSchema, OnTransactionGossipResponse>(
  `${ApiNamespace.event}/onTransactionGossip`,
  OnTransactionGossipRequestSchema,
  (request, node): void => {
    const recentlySeen = new LRU<Buffer, boolean>(1024, null, BufferMap)

    const onTransactionGossip = (transaction: Transaction) => {
      if (recentlySeen.has(transaction.hash())) {
        return
      }

      request.stream({
        serializedTransaction: transaction.serialize().toString('hex'),
      })

      recentlySeen.set(transaction.hash(), true)
    }

    node.peerNetwork.onTransactionGossipReceived.on(onTransactionGossip)

    request.onClose.on(() => {
      node.peerNetwork.onTransactionGossipReceived.off(onTransactionGossip)
    })
  },
)
