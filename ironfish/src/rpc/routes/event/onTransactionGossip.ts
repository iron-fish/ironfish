/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { Transaction } from '../../../primitives'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

// eslint-disable-next-line @typescript-eslint/ban-types
export type OnTransactionGossipRequest = {} | undefined

export type OnTransactionGossipResponse = {
  serializedTransaction: string
  valid: boolean
}

export const OnTransactionGossipRequestSchema: yup.ObjectSchema<OnTransactionGossipRequest> =
  yup.object({}).notRequired().default({})

export const OnTransactionGossipResponseSchema: yup.ObjectSchema<OnTransactionGossipResponse> =
  yup
    .object({
      serializedTransaction: yup.string().defined(),
      valid: yup.boolean().defined(),
    })
    .defined()

routes.register<typeof OnTransactionGossipRequestSchema, OnTransactionGossipResponse>(
  `${ApiNamespace.event}/onTransactionGossip`,
  OnTransactionGossipRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const onTransactionGossip = (transaction: Transaction, valid: boolean) => {
      request.stream({
        serializedTransaction: transaction.serialize().toString('hex'),
        valid,
      })
    }

    node.peerNetwork.onTransactionGossipReceived.on(onTransactionGossip)

    request.onClose.on(() => {
      node.peerNetwork.onTransactionGossipReceived.off(onTransactionGossip)
    })
  },
)
