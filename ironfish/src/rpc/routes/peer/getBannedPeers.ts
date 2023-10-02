/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { PeerNetwork } from '../../../network'
import { FullNode } from '../../../node'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'

export type BannedPeerResponse = {
  identity: string
  reason: string
}

export type GetBannedPeersRequest =
  | undefined
  | {
      stream?: boolean
    }

export type GetBannedPeersResponse = {
  peers: BannedPeerResponse[]
}

export const GetBannedPeersRequestSchema: yup.ObjectSchema<GetBannedPeersRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .optional()
  .default({})

export const GetBannedPeersResponseSchema: yup.ObjectSchema<GetBannedPeersResponse> = yup
  .object({
    peers: yup
      .array(
        yup
          .object({
            identity: yup.string().defined(),
            reason: yup.string().defined(),
          })
          .defined(),
      )
      .defined(),
  })
  .defined()

routes.register<typeof GetBannedPeersRequestSchema, GetBannedPeersResponse>(
  `${ApiNamespace.peer}/getBannedPeers`,
  GetBannedPeersRequestSchema,
  (request, node): void => {
    Assert.isInstanceOf(node, FullNode)

    const peerNetwork = node.peerNetwork

    const peers = getPeers(peerNetwork)

    if (!request.data?.stream) {
      request.end({ peers })
      return
    }

    request.stream({ peers })

    const interval = setInterval(() => {
      const peers = getPeers(peerNetwork)
      request.stream({ peers })
    }, 1000)

    request.onClose.on(() => {
      clearInterval(interval)
    })
  },
)

function getPeers(network: PeerNetwork): BannedPeerResponse[] {
  return [...network.peerManager.banned.entries()].map(([identity, reason]) => {
    return { identity, reason }
  })
}
