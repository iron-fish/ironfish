/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Buffer } from 'buffer'
import tweetnacl from 'tweetnacl'
import { Identity, PrivateIdentity } from '../identity'

export function boxMessage(
  plainTextMessage: string,
  sender: PrivateIdentity,
  recipient: Identity,
): { nonce: string; boxedMessage: string } {
  const bytes = tweetnacl.randomBytes(tweetnacl.box.nonceLength)
  return {
    nonce: Buffer.from(bytes).toString('base64'),
    boxedMessage: Buffer.from(
      tweetnacl.box(
        Buffer.from(plainTextMessage, 'utf8'),
        bytes,
        Buffer.from(recipient, 'base64'),
        sender.secretKey,
      ),
    ).toString('base64'),
  }
}

export function unboxMessage(
  boxedMessage: string,
  nonce: string,
  sender: Identity,
  recipient: PrivateIdentity,
): string | null {
  const bufferNonce = Buffer.from(nonce, 'base64')
  const bufferBoxedMessage = Buffer.from(boxedMessage, 'base64')
  const opened = tweetnacl.box.open(
    bufferBoxedMessage,
    bufferNonce,
    Buffer.from(sender, 'base64'),
    recipient.secretKey,
  )
  if (!opened) {
    return null
  }
  return Buffer.from(opened).toString('utf8')
}
