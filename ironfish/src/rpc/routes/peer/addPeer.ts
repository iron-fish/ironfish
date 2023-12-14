/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { DEFAULT_WEBSOCKET_PORT } from '../../../fileStores/config'
import { Peer } from '../../../network'
import { PeerState } from '../../../network/peers/peer'
import { FullNode } from '../../../node'
import { ErrorUtils } from '../../../utils'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type AddPeerRequest = {
  host: string
  port?: number
  whitelist?: boolean
}

export type AddPeerResponse = {
  added: boolean
  error?: string
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
    Assert.isInstanceOf(node, FullNode)

    const peerManager = node.peerNetwork.peerManager
    const { host, port, whitelist } = request.data
    const peer = peerManager.connectToWebSocketAddress({
      host,
      port: port || DEFAULT_WEBSOCKET_PORT,
      whitelist: !!whitelist,
      forceConnect: true,
    })

    if (peer === undefined) {
      request.end({ added: false })
      return
    }

    const onPeerStateChange = ({
      peer,
      state,
      prevState,
    }: {
      peer: Peer
      state: PeerState
      prevState: PeerState
    }) => {
      if (prevState.type !== 'CONNECTED' && state.type === 'CONNECTED') {
        request.end({ added: true })
        peer.onStateChanged.off(onPeerStateChange)
      } else if (prevState.type !== 'DISCONNECTED' && state.type === 'DISCONNECTED') {
        request.end({
          added: false,
          error: peer.error ? ErrorUtils.renderError(peer.error) : undefined,
        })
        peer.onStateChanged.off(onPeerStateChange)
      }
    }

    peer.onStateChanged.on(onPeerStateChange)

    request.onClose.once(() => {
      peer.onStateChanged.off(onPeerStateChange)
    })
  },
)
