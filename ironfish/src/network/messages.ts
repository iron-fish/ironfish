/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Identity, isIdentity } from './identity'
import { IJSON } from '../serde'

/**
 * The type of the message for the purposes of routing within our code.
 * This includes messages consumed by our connection and peer manager layer,
 * such as identity, signal, and peerList,
 * and message routing types such as gossip, directRPC, and globalRPC.
 */
export enum InternalMessageType {
  identity = 'identity',
  signal = 'signal',
  signalRequest = 'signalRequest',
  peerList = 'peerList',
  cannotSatisfyRequest = 'cannotSatisfyRequest',
  disconnecting = 'disconnecting',
}

export type MessageType = InternalMessageType | string
export type PayloadType = Record<string, unknown> | undefined
/**
 * Used for functions that don't care about the contents of the message.
 */
export type LooseMessage = Message<MessageType, PayloadType>

/**
 * A message that has been received on the connection. Note that most messages
 * will have other properties, but so long as an object is jsonable and has a
 * type, it's ready to send.
 */
export type Message<
  T extends MessageType,
  P extends PayloadType = undefined
> = P extends undefined ? { type: T } : { type: T; payload: P }

export type MessagePayload<M> = M extends Message<infer _T, infer P> ? P : never

export function isMessage(obj: unknown): obj is Message<MessageType, PayloadType> {
  if (typeof obj != 'object' || obj == null) return false
  if (
    'payload' in obj &&
    (typeof (obj as Message<MessageType, Record<string, unknown>>).payload !== 'object' ||
      obj === null)
  )
    return false
  return typeof (obj as Message<MessageType, PayloadType>).type == 'string'
}

export function isPayloadMessage(
  obj: unknown,
): obj is Message<MessageType, Record<string, unknown>> {
  return (
    isMessage(obj) && 'payload' in obj && typeof obj.payload === 'object' && obj.payload != null
  )
}

/**
 * Parse a message and verify that it has a type field (passes isMessage)
 *
 * Throws an error if it's not a valid message
 */
export function parseMessage(data: string): Message<MessageType, PayloadType> {
  const message = IJSON.parse(data)
  if (!isMessage(message)) {
    throw new Error('Message must have a type field')
  }
  return message
}

/**
 * A message by which a peer can identify itself to another.
 */
export type Identify = Message<
  InternalMessageType.identity,
  {
    identity: Identity
    isWorker?: boolean
    name?: string
    version: string
    port: number | null
  }
>

export function isIdentify(obj: unknown): obj is Identify {
  if (!isPayloadMessage(obj)) return false
  const payload = obj.payload as Identify['payload']
  return (
    obj.type === InternalMessageType.identity &&
    typeof payload === 'object' &&
    payload != null &&
    typeof payload.identity === 'string' &&
    typeof payload.version === 'string'
  )
}

/**
 * A message used to indicate to a peer that we want them to
 * initiatie signaling with us. This is most often used when
 * we discover a peer through another peer but need to indicate
 * to them through a brokering peer to connect to us via webrtc.
 */
export type SignalRequest = Message<
  InternalMessageType.signalRequest,
  {
    sourceIdentity: Identity
    destinationIdentity: Identity
  }
>

export function isSignalRequest(obj: unknown): obj is SignalRequest {
  if (!isPayloadMessage(obj)) return false

  const payload = obj.payload as Signal['payload']
  return (
    obj.type === InternalMessageType.signalRequest &&
    payload != null &&
    typeof payload.sourceIdentity === 'string' &&
    typeof payload.destinationIdentity === 'string'
  )
}

/**
 * A message used to signal an rtc session between two peers.
 *
 * The referring peer will forward the message to the sourceIdentity,
 * which will need to respond with a signal that has peer and source
 * inverted.
 */
export type Signal = Message<
  InternalMessageType.signal,
  {
    sourceIdentity: Identity
    destinationIdentity: Identity
    nonce: string
    signal: string
  }
>

export function isSignal(obj: unknown): obj is Signal {
  if (!isPayloadMessage(obj)) return false
  const payload = obj.payload as Signal['payload']
  return (
    obj.type === InternalMessageType.signal &&
    payload != null &&
    typeof payload.sourceIdentity === 'string' &&
    typeof payload.destinationIdentity === 'string' &&
    typeof payload.nonce === 'string' &&
    typeof payload.signal === 'string'
  )
}

export type PeerList = Message<
  InternalMessageType.peerList,
  {
    connectedPeers: {
      identity: Identity
      name?: string
      address: string | null
      port: number | null
    }[]
  }
>

export function isPeerList(obj: unknown): obj is PeerList {
  if (!isPayloadMessage(obj)) return false
  const payload = obj.payload as PeerList['payload']
  return (
    obj.type === InternalMessageType.peerList &&
    payload != null &&
    Array.isArray(payload.connectedPeers) &&
    payload.connectedPeers.every((v) => isIdentity(v.identity))
  )
}

export enum DisconnectingReason {
  ShuttingDown = 0,
  Congested = 1,
}

export type DisconnectingMessage = Message<
  InternalMessageType.disconnecting,
  {
    sourceIdentity: Identity
    // Can be null if we're sending the message to an unidentified Peer
    destinationIdentity: Identity | null
    reason: DisconnectingReason
    disconnectUntil: number
  }
>

export function isDisconnectingMessage(obj: unknown): obj is DisconnectingMessage {
  if (!isPayloadMessage(obj)) return false
  const payload = obj.payload as DisconnectingMessage['payload']
  return (
    obj.type === InternalMessageType.disconnecting &&
    payload != null &&
    typeof payload.sourceIdentity === 'string' &&
    (typeof payload.destinationIdentity === 'string' || payload.destinationIdentity === null) &&
    typeof payload.reason === 'number' &&
    typeof payload.disconnectUntil === 'number'
  )
}

/**
 * A message that we have received from a peer, identified by that peer's
 * identity.
 */
export interface IncomingPeerMessage<M extends Message<MessageType, PayloadType>> {
  peerIdentity: Identity
  message: M
}
