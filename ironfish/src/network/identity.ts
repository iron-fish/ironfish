/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BoxKeyPair, KEY_LENGTH } from '@ironfish/rust-nodejs'

/**
 * Types and helper functions related to a peer's identity.
 */

/**
 * The entire identity required to send messages on the peer network.
 * An object consisting of a public key and a private key.
 */
export type PrivateIdentity = BoxKeyPair

/**
 * A base64-encoded 32-byte public key exposed to other peers on the network.
 */
export type Identity = string

/**
 * Length of the identity in bytes.
 */
export const identityLength = KEY_LENGTH

/**
 * Length of the secret key from PrivateIdentity in bytes.
 */
export const secretKeyLength = KEY_LENGTH

/**
 * Length of the identity as a base64-encoded string.
 */
export const base64IdentityLength = Math.ceil(identityLength / 3) * 4

/**
 * Length of the secret key as a hex-encoded string.
 */
export const hexSecretKeyLength = secretKeyLength * 2

export function isHexSecretKey(obj: string): boolean {
  return (
    obj.length === hexSecretKeyLength &&
    Buffer.from(obj, 'hex').toString('hex').toLowerCase() === obj.toLowerCase()
  )
}

export function isIdentity(obj: string): boolean {
  // Should be a base64-encoded string with the expected length
  return (
    obj.length === base64IdentityLength && Buffer.from(obj, 'base64').toString('base64') === obj
  )
}

export function canInitiateWebRTC(source: Identity, dest: Identity): boolean {
  return source > dest
}

export function canKeepDuplicateConnection(source: Identity, dest: Identity): boolean {
  return canInitiateWebRTC(source, dest)
}

export function privateIdentityToIdentity(identity: PrivateIdentity): Identity {
  return Buffer.from(identity.publicKey).toString('base64')
}
