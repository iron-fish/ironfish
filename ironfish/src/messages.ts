/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BlockRequest,
  BlocksResponse,
  MessageType,
  NoteRequest,
  NoteResponse,
  NullifierRequest,
  NullifierResponse,
} from './captain/messages'
import { Gossip, MessagePayload, Rpc } from './network'
import {
  IronfishVerifier,
  SerializedTransaction,
  SerializedWasmNoteEncrypted,
} from './strategy'
import { UnwrapPromise } from './utils'

export type NewBlockMessage = Gossip<
  MessageType.NewBlock,
  UnwrapPromise<ReturnType<IronfishVerifier['verifyNewBlock']>>
>

export type NewTransactionMessage = Gossip<
  MessageType.NewTransaction,
  UnwrapPromise<ReturnType<IronfishVerifier['verifyNewTransaction']>>
>

export type BlockRequestMessage = Rpc<MessageType.Blocks, MessagePayload<BlockRequest>>

export type BlocksResponseMessage = Rpc<
  MessageType.Blocks,
  MessagePayload<BlocksResponse<SerializedWasmNoteEncrypted, SerializedTransaction>>
>

export type NoteRequestMessage = Rpc<MessageType.Note, MessagePayload<NoteRequest>>

export type NoteResponseMessage = Rpc<
  MessageType.Note,
  MessagePayload<NoteResponse<SerializedWasmNoteEncrypted>>
>

export type NullifierRequestMessage = Rpc<
  MessageType.Nullifier,
  MessagePayload<NullifierRequest>
>
export type NullifierResponseMessage = Rpc<
  MessageType.Nullifier,
  MessagePayload<NullifierResponse>
>
