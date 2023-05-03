/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Connection } from '../../../network/peers/connections'
import { PeerCandidate } from '../../../network/peers/peerCandidates'
import { Features } from '../../../network/peers/peerFeatures'

export type ConnectionRetryResponse = {
  disconnectUntil: number
  failedRetries: number
}

export type PeerCandidateResponse = {
  name?: string
  address?: string
  port?: number
  neighbors: string[]
  webRtcRetry: ConnectionRetryResponse
  websocketRetry: ConnectionRetryResponse
  peerRequestedDisconnectUntil?: number
  localRequestedDisconnectUntil?: number
}

export const ConnectionRetryResponseSchema: yup.ObjectSchema<ConnectionRetryResponse> = yup
  .object({
    disconnectUntil: yup.number().defined(),
    failedRetries: yup.number().defined(),
  })
  .defined()

export const PeerCandidateResponseSchema: yup.ObjectSchema<PeerCandidateResponse> = yup
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
  .defined()

export type ConnectionState = Connection['state']['type'] | ''

export type PeerResponse = {
  state: string
  identity: string | null
  version: number | null
  head: string | null
  sequence: number | null
  work: string | null
  agent: string | null
  name: string | null
  address: string | null
  port: number | null
  error: string | null
  connections: number
  connectionWebSocket: ConnectionState
  connectionWebSocketError: string
  connectionWebRTC: ConnectionState
  connectionWebRTCError: string
  networkId: number | null
  genesisBlockHash: string | null
  features: Features | null
  candidate?: PeerCandidateResponse
}

export const PeerResponseSchema = yup.object({
  state: yup.string().defined(),
  address: yup.string().nullable().defined(),
  port: yup.number().nullable().defined(),
  identity: yup.string().nullable().defined(),
  name: yup.string().nullable().defined(),
  head: yup.string().nullable().defined(),
  work: yup.string().nullable().defined(),
  sequence: yup.number().nullable().defined(),
  version: yup.number().nullable().defined(),
  agent: yup.string().nullable().defined(),
  error: yup.string().nullable().defined(),
  connections: yup.number().defined(),
  connectionWebSocket: yup.string<ConnectionState>().defined(),
  connectionWebSocketError: yup.string().defined(),
  connectionWebRTC: yup.string<ConnectionState>().defined(),
  connectionWebRTCError: yup.string().defined(),
  networkId: yup.number().nullable().defined(),
  genesisBlockHash: yup.string().nullable().defined(),
  features: yup
    .object({
      syncing: yup.boolean().defined(),
    })
    .nullable()
    .defined(),
  candidate: PeerCandidateResponseSchema.optional(),
})

export function createPeerCandidateResponse(candidate: PeerCandidate): PeerCandidateResponse {
  return {
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
  }
}
