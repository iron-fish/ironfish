/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import * as yup from 'yup'
import { AssetVerification } from '../../assets'
import { Connection } from '../../network'
import { Features } from '../../network/peers/peerFeatures'
import { BlockHeader } from '../../primitives'
import { RpcTransaction, RpcTransactionSchema } from './chain/types'

export type RpcBurn = {
  assetId: string
  value: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  id: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
}

export const RpcBurnSchema: yup.ObjectSchema<RpcBurn> = yup
  .object({
    id: yup.string().defined(),
    assetId: yup.string().defined(),
    assetName: yup.string().defined(),
    value: yup.string().defined(),
  })
  .defined()

export type RpcMint = {
  assetId: string
  value: string
  transferOwnershipTo?: string
  /**
   * @deprecated Please use assetId instead
   */
  id: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  assetName: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  metadata: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  name: string
  /**
   * @deprecated Please use getAsset endpoint to get this information
   */
  creator: string
}

export const RpcMintSchema: yup.ObjectSchema<RpcMint> = yup
  .object({
    assetId: yup.string().defined(),
    value: yup.string().defined(),
    transferOwnershipTo: yup.string().optional(),
    id: yup.string().defined(),
    metadata: yup.string().defined(),
    name: yup.string().defined(),
    creator: yup.string().defined(),
    assetName: yup.string().defined(),
  })
  .defined()

export type RpcAsset = {
  id: string
  name: string
  nonce: number
  owner: string
  creator: string
  metadata: string
  createdTransactionHash: string
  verification: AssetVerification
  supply?: string
  /**
   * @deprecated query for the transaction to find it's status
   */
  status: string
}

export const RpcAssetSchema: yup.ObjectSchema<RpcAsset> = yup
  .object({
    id: yup.string().required(),
    metadata: yup.string().required(),
    name: yup.string().required(),
    nonce: yup.number().required(),
    creator: yup.string().required(),
    verification: yup
      .object({
        status: yup.string().oneOf(['verified', 'unverified', 'unknown']).defined(),
        symbol: yup.string().optional(),
        decimals: yup.number().optional(),
        logoURI: yup.string().optional(),
        website: yup.string().optional(),
      })
      .defined(),
    status: yup.string().defined(),
    supply: yup.string().optional(),
    owner: yup.string().defined(),
    createdTransactionHash: yup.string().defined(),
  })
  .defined()

export type RpcEncryptedNote = {
  hash: string
  serialized: string
  /**
   * @deprecated Please use hash instead
   */
  commitment: string
}

export const RpcEncryptedNoteSchema: yup.ObjectSchema<RpcEncryptedNote> = yup
  .object({
    commitment: yup.string().defined(),
    hash: yup.string().defined(),
    serialized: yup.string().defined(),
  })
  .defined()

export type RpcBlockHeader = {
  hash: string
  sequence: number
  previousBlockHash: string
  difficulty: string
  noteCommitment: string
  transactionCommitment: string
  target: string
  randomness: string
  timestamp: number
  graffiti: string
  work: string
  noteSize: number | null
  /**
   * @deprecated Please use previousBlockHash instead
   */
  previous: string
}

export function serializeRpcBlockHeader(header: BlockHeader): RpcBlockHeader {
  return {
    hash: header.hash.toString('hex'),
    previous: header.previousBlockHash.toString('hex'),
    sequence: Number(header.sequence),
    previousBlockHash: header.previousBlockHash.toString('hex'),
    timestamp: header.timestamp.valueOf(),
    difficulty: header.target.toDifficulty().toString(),
    graffiti: header.graffiti.toString('hex'),
    noteCommitment: header.noteCommitment.toString('hex'),
    transactionCommitment: header.transactionCommitment.toString('hex'),
    target: header.target.asBigInt().toString(),
    randomness: header.randomness.toString(),
    work: header.work.toString(),
    noteSize: header.noteSize ?? null,
  }
}

export const RpcBlockHeaderSchema: yup.ObjectSchema<RpcBlockHeader> = yup
  .object({
    hash: yup.string().defined(),
    previous: yup.string().defined(),
    sequence: yup.number().defined(),
    previousBlockHash: yup.string().defined(),
    timestamp: yup.number().defined(),
    difficulty: yup.string().defined(),
    graffiti: yup.string().defined(),
    noteCommitment: yup.string().defined(),
    transactionCommitment: yup.string().defined(),
    target: yup.string().defined(),
    randomness: yup.string().defined(),
    work: yup.string().defined(),
    noteSize: yup.number().nullable().defined(),
  })
  .defined()

export type RpcBlock = RpcBlockHeader & {
  size: number
  transactions: RpcTransaction[]
}

export const RpcBlockSchema: yup.ObjectSchema<RpcBlock> = RpcBlockHeaderSchema.concat(
  yup
    .object({
      size: yup.number().defined(),
      transactions: yup.array(RpcTransactionSchema).defined(),
    })
    .defined(),
)

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
