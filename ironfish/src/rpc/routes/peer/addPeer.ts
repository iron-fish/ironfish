/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { DEFAULT_WEBSOCKET_PORT } from '../../../fileStores/config'
import { IronfishNode } from '../../../node'
import { ApiNamespace, routes } from '../router'

export type AddPeerRequest = {
  host: string
  port?: number
  whitelist?: boolean
}

export type AddPeerResponse = {
  added: boolean
}

export const AddPeerRequestSchema: yup.ObjectSchema<AddPeerRequest> = yup
  .object({
    host: yup.string().defined(),
    port: yup.number().optional(),
    whitelist: yup.boolean().optional(),
  })
  .defined()

export const AddPeerResponseSchema: yup.ObjectSchema<AddPeerResponse> = yup
  .object({
    added: yup.boolean().defined(),
    error: yup.string().optional(),
  })
  .defined()

routes.register<typeof AddPeerRequestSchema, AddPeerResponse>(
  `${ApiNamespace.peer}/addPeer`,
  AddPeerRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, IronfishNode)

    const peerManager = node.peerNetwork.peerManager
    const { host, port, whitelist } = request.data

    const peer = peerManager.connectToWebSocketAddress({
      host,
      port: port || DEFAULT_WEBSOCKET_PORT,
      whitelist: !!whitelist,
      forceConnect: true,
    })

    request.end({ added: peer !== undefined })
  },
)
