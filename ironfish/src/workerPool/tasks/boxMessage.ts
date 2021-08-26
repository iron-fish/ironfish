/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Identity, PrivateIdentity } from '../../network/identity'
import { boxMessage } from '../../network/peers/encryption'

export type BoxMessageRequest = {
  type: 'boxMessage'
  message: string
  sender: PrivateIdentity
  recipient: Identity
}

export type BoxMessageResponse = {
  type: 'boxMessage'
  nonce: string
  boxedMessage: string
}

export function handleBoxMessage({
  message,
  sender,
  recipient,
}: BoxMessageRequest): BoxMessageResponse {
  const { nonce, boxedMessage } = boxMessage(message, sender, recipient)
  return {
    type: 'boxMessage',
    nonce,
    boxedMessage,
  }
}
