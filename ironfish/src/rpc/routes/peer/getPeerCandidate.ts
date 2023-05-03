/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

export type GetPeerCandidateRequest = {
  identity: string
}

export type ConnectionRetryResponse = {
  disconnectUntil: number
  failedRetries: number
}

export type GetPeerCandidateResponse = {
  candidate?: {
    name?: string
    address?: string
    port?: number
    neighbors: string[]
    webRtcRetry: ConnectionRetryResponse
    websocketRetry: ConnectionRetryResponse
    peerRequestedDisconnectUntil?: number
    localRequestedDisconnectUntil?: number
  }
}

export const GetPeerCandidateRequestSchema: yup.ObjectSchema<GetPeerCandidateRequest> = yup
  .object({
    identity: yup.string().defined(),
  })
  .defined()

export const ConnectionRetryResponseSchema: yup.ObjectSchema<ConnectionRetryResponse> = yup
  .object({
    disconnectUntil: yup.number().defined(),
    failedRetries: yup.number().defined(),
  })
  .defined()

export const GetPeerCandidateResponseSchema: yup.ObjectSchema<GetPeerCandidateResponse> = yup
  .object({
    candidate: yup
      .object({
        name: yup.string().optional(),
        address: yup.string().optional(),
        port: yup.number().optional(),
        neighbors: yup.array(yup.string().defined()).defined(),
        webRtcRetry: ConnectionRetryResponseSchema,
        websocketRetry: ConnectionRetryResponseSchema,
        peerRequestedDisconnectUntil: yup.number().optional(),
        localRequestedDisconnectUntil: yup.number().optional(),
      })
      .optional(),
  })
  .defined()

router.register<typeof GetPeerCandidateRequestSchema, GetPeerCandidateResponse>(
  `${ApiNamespace.peer}/getCandidate`,
  GetPeerCandidateRequestSchema,
  (request, node): void => {
    const peerNetwork = node.peerNetwork

    const candidate = peerNetwork.peerManager.peerCandidates.get(request.data.identity)

    if (!candidate) {
      request.end({ candidate: undefined })
      return
    }

    request.end({
      candidate: {
        name: candidate.name,
        address: candidate.address ?? undefined,
        port: candidate.port ?? undefined,
        neighbors: [...candidate.neighbors],
        webRtcRetry: {
          disconnectUntil: candidate.webRtcRetry.disconnectUntil,
          failedRetries: candidate.webRtcRetry.failedRetries,
        },
        websocketRetry: {
          disconnectUntil: candidate.websocketRetry.disconnectUntil,
          failedRetries: candidate.websocketRetry.failedRetries,
        },
        peerRequestedDisconnectUntil: candidate.peerRequestedDisconnectUntil ?? undefined,
        localRequestedDisconnectUntil: candidate.localRequestedDisconnectUntil ?? undefined,
      },
    })
  },
)
