/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { SerializedBlock } from '../primitives/block'
import { SerializedTransaction, Transaction } from '../primitives/transaction'
import { IJSON } from '../serde'
import { UnwrapPromise } from '../utils'
import { Identity } from './identity'
import { Gossip } from './messageRouters'
import { NetworkMessage } from './messages/networkMessage'

export type MessageType = string
export type PayloadType = Record<string, unknown> | undefined
/**
 * Used for functions that don't care about the contents of the message.
 */
export type LooseMessage = Message<MessageType, Record<string, unknown>> | Message<MessageType>

/**
 * A message that has been received on the connection. Note that most messages
 * will have other properties, but so long as an object is jsonable and has a
 * type, it's ready to send.
 */
export type Message<
  T extends MessageType,
  P extends PayloadType = undefined,
> = P extends undefined ? { type: T } : { type: T; payload: P }

export type MessagePayload<M> = M extends Message<infer _T, infer P> ? P : never

export function isMessage(obj: unknown): obj is Message<MessageType, PayloadType> {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }
  if (
    'payload' in obj &&
    (typeof (obj as Message<MessageType, Record<string, unknown>>).payload !== 'object' ||
      obj === null)
  ) {
    return false
  }
  return typeof (obj as Message<MessageType, PayloadType>).type === 'string'
}

export function isPayloadMessage(
  obj: unknown,
): obj is Message<MessageType, Record<string, unknown>> {
  return (
    isMessage(obj) &&
    'payload' in obj &&
    typeof obj.payload === 'object' &&
    obj.payload !== null
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
 * A message that we have received from a peer, identified by that peer's
 * identity.
 */
export interface IncomingPeerMessage<
  M extends Message<MessageType, PayloadType> | NetworkMessage,
> {
  peerIdentity: Identity
  message: M
}

/**
 * The type of a Iron Fish message. This is an exhaustive list of
 * the messages that are sent from IronfishNode. Other messages may
 * be sent by peerNetwork's internal mechanisms (for example, a peer list).
 *
 * Note: A Response to a Request must have the same MessageType
 */
export enum NodeMessageType {
  NewBlock = 'NewBlock',
  NewTransaction = 'NewTransaction',
  GetBlockHashes = 'GetBlockHashes',
}

export type GetBlockHashesRequest = Message<
  NodeMessageType.GetBlockHashes,
  {
    start: string | number
    limit: number
  }
>

export type GetBlockHashesResponse = Message<
  NodeMessageType.GetBlockHashes,
  {
    blocks: string[]
  }
>

export function isGetBlockHashesResponse(obj: LooseMessage): obj is GetBlockHashesResponse {
  if (
    obj.type === NodeMessageType.GetBlockHashes &&
    'payload' in obj &&
    'blocks' in obj.payload &&
    Array.isArray(obj.payload.blocks)
  ) {
    for (const block of obj.payload.blocks) {
      if (!isBlockHash(block)) {
        return false
      }
    }

    return true
  }

  return false
}
export function isGetBlockHashesRequest(
  obj: PayloadType,
): obj is GetBlockHashesRequest['payload'] {
  return (
    obj !== undefined &&
    'start' in obj &&
    (typeof obj.start === 'string' || typeof obj.start === 'number') &&
    'limit' in obj &&
    typeof obj.limit === 'number'
  )
}

function isBlockHash(obj: unknown | undefined): obj is string {
  return typeof obj === 'string'
}

/**
 * A newly mined block gossipped on the P2P network
 */
export type NewBlock = Message<'NewBlock', { block: SerializedBlock }>

/**
 * Type narrowing to confirm the message payload contains a `block` object.
 * Does not try to confirm whether it is a correct block.
 */
export function isNewBlockPayload(obj: PayloadType): obj is NewBlock['payload'] {
  return (
    obj !== undefined && 'block' in obj && typeof obj.block === 'object' && obj.block !== null
  )
}

/**
 * A newly spent transaction that a client would like to have mined
 */
export type NewTransaction = Message<
  'NewTransaction',
  {
    transaction: SerializedTransaction
  }
>

/**
 * Type narrowing to confirm the message payload contains a `transaction`
 * object. Does not try to validate the transaction.
 */
export function isNewTransactionPayload(obj: PayloadType): obj is NewTransaction['payload'] {
  return (
    obj !== undefined &&
    'transaction' in obj &&
    typeof obj.transaction === 'object' &&
    obj.transaction !== null
  )
}

export type NewBlockMessage = Gossip<
  NodeMessageType.NewBlock,
  UnwrapPromise<{ block: SerializedBlock }>
>

export type NewTransactionMessage = Gossip<
  NodeMessageType.NewTransaction,
  UnwrapPromise<{ transaction: Transaction }>
>
