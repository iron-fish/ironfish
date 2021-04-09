/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Identity, isIdentity } from './identity'
import { IJSON } from '../serde'
import { SerializedBlock } from '../captain/anchorChain/blockchain/Block'
import { Gossip, Rpc } from './messageRouters'
import { UnwrapPromise } from '../utils'
import {
  IronfishVerifier,
  SerializedTransaction,
  SerializedWasmNoteEncrypted,
} from '../strategy'

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

/**
 * The type of a Iron Fish message. This is an exhaustive list of
 * the messages that are sent from Captain. Other messages may
 * be sent by peerNetwork's internal mechanisms (for example, a peer list).
 *
 * Note: A Response to a Request must have the same MessageType
 */
export enum NodeMessageType {
  Note = 'Note',
  Nullifier = 'Nullifier',
  Blocks = 'Blocks',
  NewBlock = 'NewBlock',
  NewTransaction = 'NewTransaction',
}

/**
 * A request for a note by its position in the notes merkle tree.
 *
 * Handler is in `TreeSyncer`
 */
export type NoteRequest = Message<NodeMessageType.Note, { position: number }>

/**
 * Type narrowing to confirm a `NoteRequest` has the requisite type and position field.
 */
export function isNoteRequestPayload(obj: PayloadType): obj is MessagePayload<NoteRequest> {
  return obj != null && 'position' in obj && typeof obj.position === 'number'
}

/**
 * A response to a note request, returned by the handler in TreeSyncer
 *
 * The note is a serialized note entity.
 */
export type NoteResponse<SE> = Rpc<NodeMessageType.Note, { note: SE; position: number }>

/**
 * Type narrowing to confirm a `NoteResponse` has the requisite type and
 * a note payload. Does not try to deserialize the note or verify it in any way.
 */
export function isNoteResponsePayload<SE>(
  obj: PayloadType,
): obj is MessagePayload<NoteResponse<SE>> {
  return obj != null && 'note' in obj && 'position' in obj && typeof obj.position === 'number'
}

/**
 * Type narrowing to confirm a `NoteResponse` has the requisite type and
 * a note payload. Does not try to deserialize the note or verify it in any way.
 */
export function isNoteResponse<SE>(obj: LooseMessage): obj is NoteResponse<SE> {
  return (
    obj.type === NodeMessageType.Note && 'payload' in obj && isNoteResponsePayload(obj.payload)
  )
}

/**
 * A request for a nullifier by its position in the notes merkle tree.
 */
export type NullifierRequest = Message<NodeMessageType.Nullifier, { position: number }>

/**
 * Type narrowing to confirm a `'nullifierRequest` has the requisite type and position
 */
export function isNullifierRequestPayload(
  obj: PayloadType,
): obj is MessagePayload<NullifierRequest> {
  return obj != null && 'position' in obj && typeof obj.position === 'number'
}

/**
 * A response to a request for a nullifier
 */
export type NullifierResponse = Rpc<
  NodeMessageType.Nullifier,
  { nullifier: string; position: number }
>

/**
 * Type narrowing to confirm a `NullifierResponse` has the requisite type and
 * a nullifier payload. Does not try to deserialize the nullifier or verify it in any way.
 */
export function isNullifierResponse(obj: LooseMessage): obj is NullifierResponse {
  return (
    obj.type === NodeMessageType.Nullifier &&
    'payload' in obj &&
    isNullifierRequestPayload(obj.payload)
  )
}

export function isNullifierResponsePayload(
  obj: PayloadType,
): obj is MessagePayload<NullifierResponse> {
  return obj != null && 'nullifier' in obj && typeof obj.nullifier === 'string'
}

/**
 * A request for a block.
 *
 * A response to this request should be for the block before the given hash
 * with the given sequence
 *
 * If the given hash is undefined, return the head block of the heaviest chain
 */
export type BlockRequest = Message<
  NodeMessageType.Blocks,
  {
    /**
     * The hash that the block request is relative to.
     */
    hash: string
    /**
     * To either respond with the next block in the forwards direction
     * from given hash or not
     */
    nextBlockDirection: boolean
  }
>

/**
 * Type narrowing to verify that the block has the hash and sequence parameters
 * and that they are either undefined or strings.
 */
export function isBlockRequestPayload(obj: PayloadType): obj is BlockRequest['payload'] {
  return obj != null && 'hash' in obj && (typeof obj.hash === 'string' || obj.hash === null)
}

/**
 * A response to a request for a block. A valid message contains an array of serialized block.
 */
export type BlocksResponse<SH, ST> = Rpc<
  NodeMessageType.Blocks,
  { blocks: SerializedBlock<SH, ST>[] }
>

/**
 * Type narrowing to confirm the message payload contains a `block` object
 * that represents a serialized block.
 * Does not do anything to confirm whether that object is a legitimate block.
 */
export function isBlocksResponse<SH, ST>(obj: LooseMessage): obj is BlocksResponse<SH, ST> {
  const ret = obj.type === NodeMessageType.Blocks && 'payload' in obj && 'blocks' in obj.payload
  return ret
}

/**
 * A newly mined block gossipped on the P2P network
 */
export type NewBlock<SH, ST> = Message<'NewBlock', { block: SerializedBlock<SH, ST> }>

/**
 * Type narrowing to confirm the message payload contains a `block` object.
 * Does not try to confirm whether it is a correct block.
 */
export function isNewBlockPayload<SH, ST>(
  obj: PayloadType,
): obj is NewBlock<SH, ST>['payload'] {
  return obj != null && 'block' in obj && typeof obj.block === 'object' && obj.block != null
}

/**
 * A newly spent transaction that a client would like to have mined
 */
export type NewTransaction<ST> = Message<
  'NewTransaction',
  {
    transaction: ST
  }
>

/**
 * Type narrowing to confirm the message payload contains a `transaction`
 * object. Does not try to validate the transaction.
 */
export function isNewTransactionPayload<ST>(
  obj: PayloadType,
): obj is NewTransaction<ST>['payload'] {
  return (
    obj != null &&
    'transaction' in obj &&
    typeof obj.transaction === 'object' &&
    obj.transaction != null
  )
}

export type NewBlockMessage = Gossip<
  NodeMessageType.NewBlock,
  UnwrapPromise<ReturnType<IronfishVerifier['verifyNewBlock']>>
>

export type NewTransactionMessage = Gossip<
  NodeMessageType.NewTransaction,
  UnwrapPromise<ReturnType<IronfishVerifier['verifyNewTransaction']>>
>

export type BlockRequestMessage = Rpc<NodeMessageType.Blocks, MessagePayload<BlockRequest>>

export type BlocksResponseMessage = Rpc<
  NodeMessageType.Blocks,
  MessagePayload<BlocksResponse<SerializedWasmNoteEncrypted, SerializedTransaction>>
>

export type NoteRequestMessage = Rpc<NodeMessageType.Note, MessagePayload<NoteRequest>>

export type NoteResponseMessage = Rpc<
  NodeMessageType.Note,
  MessagePayload<NoteResponse<SerializedWasmNoteEncrypted>>
>

export type NullifierRequestMessage = Rpc<
  NodeMessageType.Nullifier,
  MessagePayload<NullifierRequest>
>
export type NullifierResponseMessage = Rpc<
  NodeMessageType.Nullifier,
  MessagePayload<NullifierResponse>
>
