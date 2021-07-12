/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Connection, PeerNetwork } from '../../../network'
import { ApiNamespace, router } from '../router'

type PeerMessage = {
  brokeringPeerDisplayName?: string
  direction: 'send' | 'receive'
  message:
    | {
        type: string
      }
    | {
        type: string
        payload: Record<string, unknown>
      }
  timestamp: number
  type: Connection['type']
}

export type GetPeerMessagesRequest = {
  identity: string
  stream?: boolean
}

export type GetPeerMessagesResponse = {
  messages: Array<PeerMessage>
}

export const GetPeerMessagesRequestSchema: yup.ObjectSchema<GetPeerMessagesRequest> = yup
  .object({
    identity: yup.string().defined(),
    stream: yup.boolean().optional(),
  })
  .defined()

export const GetPeerMessagesResponseSchema: yup.ObjectSchema<GetPeerMessagesResponse> = yup
  .object({
    messages: yup
      .array(
        yup
          .object({
            brokeringPeerDisplayName: yup.string().optional(),
            direction: yup.string<'send' | 'receive'>().defined(),
            message: yup
              .object({
                type: yup.string().defined(),
                payload: yup.object().optional(),
              })
              .defined(),
            timestamp: yup.number().defined(),
            type: yup.string<Connection['type']>().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

router.register<typeof GetPeerMessagesRequestSchema, GetPeerMessagesResponse>(
  `${ApiNamespace.peer}/getPeerMessages`,
  GetPeerMessagesRequestSchema,
  (request, node): void => {
    const peerNetwork = node.peerNetwork

    if (!peerNetwork) {
      request.end({ messages: [] })
      return
    }

    const messages = getPeerMessages(peerNetwork, request.data.identity)

    if (!request.data.stream) {
      request.end({ messages })
      return
    }

    request.stream({ messages })

    const interval = setInterval(() => {
      const messages = getPeerMessages(peerNetwork, request.data.identity)
      request.stream({ messages })
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getPeerMessages(network: PeerNetwork, identity: string): Array<PeerMessage> {
  for (const peer of network.peerManager.peers) {
    if (peer.state.identity !== null && peer.state.identity.includes(identity)) {
      return peer.loggedMessages.map((msg) => {
        return {
          ...msg,
        }
      })
    }
  }

  return []
}
