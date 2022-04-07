/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IJSON } from '../serde'
import { Identity } from './identity'
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
