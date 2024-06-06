/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { Connection } from '../../../network'
import { Features } from '../../../network/peers/peerFeatures'

export type ConnectionState = Connection['state']['type'] | ''

export type RpcPeerResponse = {
  state: string
  connectionWebSocket: ConnectionState
  connectionWebSocketError: string
  connectionWebRTC: ConnectionState
  connectionWebRTCError: string
  connectionDirection: string
  connections: number
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
  networkId: number | null
  genesisBlockHash: string | null
  features: Features | null
}

export const RpcPeerResponseSchema: yup.ObjectSchema<RpcPeerResponse> = yup
  .object({
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
    connectionDirection: yup.string().defined(),
    networkId: yup.number().nullable().defined(),
    genesisBlockHash: yup.string().nullable().defined(),
    features: yup
      .object({
        syncing: yup.boolean().defined(),
      })
      .nullable()
      .defined(),
  })
  .defined()
