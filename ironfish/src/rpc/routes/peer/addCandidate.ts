/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { DEFAULT_WEBSOCKET_PORT } from '../../../fileStores/config'
import { ApiNamespace, router } from '../router'

export type AddPeerCandidateRequest = {
  host: string
  port?: number
  whitelist?: boolean
}

export type AddPeerCandidateResponse = {
  added: boolean
  error?: string
}

export const AddPeerCandidateRequestSchema: yup.ObjectSchema<AddPeerCandidateRequest> = yup
  .object({
    host: yup.string().defined(),
    port: yup.number().optional(),
    whitelist: yup.boolean().optional(),
  })
  .defined()

export const AddPeerCandidateResponseSchema: yup.ObjectSchema<AddPeerCandidateResponse> = yup
  .object({
    added: yup.boolean().defined(),
    error: yup.string().optional(),
  })
  .defined()

router.register<typeof AddPeerCandidateRequestSchema, AddPeerCandidateResponse>(
  `${ApiNamespace.peer}/addCandidate`,
  AddPeerCandidateRequestSchema,
  (request, node): void => {
    const peerManager = node.peerNetwork.peerManager
    const { host, port, whitelist } = request.data

    const peer = peerManager.connectToWebSocketAddress({
      host,
      port: port || DEFAULT_WEBSOCKET_PORT,
      whitelist: !!whitelist,
    })

    request.end({ added: peer !== undefined })
  },
)
