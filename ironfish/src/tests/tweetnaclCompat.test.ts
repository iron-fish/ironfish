/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  BoxKeyPair,
  boxMessage,
  KEY_LENGTH,
  NONCE_LENGTH,
  unboxMessage,
} from '@ironfish/rust-nodejs'
import tweetnacl from 'tweetnacl'

describe('Tweetnacl compatibility with rust bindings', () => {
  it('key and nonce length', () => {
    expect(KEY_LENGTH).toEqual(tweetnacl.box.publicKeyLength)
    expect(KEY_LENGTH).toEqual(tweetnacl.box.secretKeyLength)
    expect(NONCE_LENGTH).toEqual(tweetnacl.box.nonceLength)
  })

  it('box key pair', () => {
    const tweetPair = tweetnacl.box.keyPair()
    const rustPair = new BoxKeyPair()

    expect(tweetPair.publicKey.length).toEqual(KEY_LENGTH)
    expect(tweetPair.secretKey.length).toEqual(KEY_LENGTH)
    expect(rustPair.publicKey.length).toEqual(KEY_LENGTH)
    expect(rustPair.secretKey.length).toEqual(KEY_LENGTH)
  })

  it('from hex to secret key', () => {
    const networkIdentity = 'e9cd0c56d0c09e3bfc392039665474ad68438de484363f32087093927812983b'
    const hexArray = Uint8Array.from(Buffer.from(networkIdentity, 'hex'))

    const tweetPair = tweetnacl.box.keyPair.fromSecretKey(hexArray)
    const rustPair = BoxKeyPair.fromHex(networkIdentity)

    expect(Buffer.from(tweetPair.secretKey)).toEqual(rustPair.secretKey)
    expect(Buffer.from(tweetPair.publicKey)).toEqual(rustPair.publicKey)
  })

  it('box and unbox messages', () => {
    const tweetPair = tweetnacl.box.keyPair()
    const rustPair = new BoxKeyPair()

    const plainText = 'Hello hello hello'

    const tweetNonce = tweetnacl.randomBytes(NONCE_LENGTH)
    const tweetBoxed = Buffer.from(
      tweetnacl.box(
        Buffer.from(plainText, 'utf8'),
        tweetNonce,
        rustPair.publicKey,
        tweetPair.secretKey,
      ),
    ).toString('base64')

    const rustBoxed = boxMessage(
      plainText,
      rustPair.secretKey,
      Buffer.from(tweetPair.publicKey).toString('base64'),
    )

    const tweetUnboxed = unboxMessage(
      tweetBoxed,
      Buffer.from(tweetNonce).toString('base64'),
      Buffer.from(tweetPair.publicKey).toString('base64'),
      rustPair.secretKey,
    )

    const rustUnboxed = Buffer.from(
      tweetnacl.box.open(
        Buffer.from(rustBoxed.boxedMessage, 'base64'),
        Buffer.from(rustBoxed.nonce, 'base64'),
        rustPair.publicKey,
        tweetPair.secretKey,
      ) || '',
    ).toString('utf8')

    expect(tweetUnboxed).toEqual(plainText)
    expect(rustUnboxed).toEqual(plainText)
  })
})
