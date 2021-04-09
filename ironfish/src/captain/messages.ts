/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LooseMessage, Message, MessagePayload, PayloadType, Rpc } from '../network'

import { SerializedBlock } from './anchorChain/blockchain/Block'

/**
 * The type of a Iron Fish message. This is an exhaustive list of
 * the messages that are sent from Captain. Other messages may
 * be sent by peerNetwork's internal mechanisms (for example, a peer list).
 *
 * Note: A Response to a Request must have the same MessageType
 */
export enum MessageType {
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
export type NoteRequest = Message<MessageType.Note, { position: number }>

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
export type NoteResponse<SE> = Rpc<MessageType.Note, { note: SE; position: number }>

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
  return obj.type === MessageType.Note && 'payload' in obj && isNoteResponsePayload(obj.payload)
}

/**
 * A request for a nullifier by its position in the notes merkle tree.
 */
export type NullifierRequest = Message<MessageType.Nullifier, { position: number }>

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
  MessageType.Nullifier,
  { nullifier: string; position: number }
>

/**
 * Type narrowing to confirm a `NullifierResponse` has the requisite type and
 * a nullifier payload. Does not try to deserialize the nullifier or verify it in any way.
 */
export function isNullifierResponse(obj: LooseMessage): obj is NullifierResponse {
  return (
    obj.type === MessageType.Nullifier &&
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
  MessageType.Blocks,
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
  MessageType.Blocks,
  { blocks: SerializedBlock<SH, ST>[] }
>

/**
 * Type narrowing to confirm the message payload contains a `block` object
 * that represents a serialized block.
 * Does not do anything to confirm whether that object is a legitimate block.
 */
export function isBlocksResponse<SH, ST>(obj: LooseMessage): obj is BlocksResponse<SH, ST> {
  const ret = obj.type === MessageType.Blocks && 'payload' in obj && 'blocks' in obj.payload
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
