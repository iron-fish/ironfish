/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Identity, PrivateIdentity } from '../../network/identity'
import { unboxMessage } from '../../network/peers/encryption'

export type UnboxMessageRequest = {
  type: 'unboxMessage'
  boxedMessage: string
  nonce: string
  sender: Identity
  recipient: PrivateIdentity
}

export type UnboxMessageResponse = {
  type: 'unboxMessage'
  message: string | null
}

export function handleUnboxMessage({
  boxedMessage,
  nonce,
  sender,
  recipient,
}: UnboxMessageRequest): UnboxMessageResponse {
  const result = unboxMessage(boxedMessage, nonce, sender, recipient)

  return {
    type: 'unboxMessage',
    message: result === null ? null : Buffer.from(result).toString('utf8'),
  }
}
