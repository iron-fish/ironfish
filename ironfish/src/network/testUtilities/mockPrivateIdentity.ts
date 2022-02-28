/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { identityLength, PrivateIdentity } from '../identity'

// The identities here are in order of:
// Lowest:   webRtcCanInitiateIdentityPrivate
// Middle:   webRtcLocalIdentity
// Greatest: webRtcCannotInitiateIdentityPrivate

/** webRtcCanInitiateIdentity as a base64 string is less than webRtcLocalIdentity */
export const webRtcCanInitiateIdentityPrivate = (): PrivateIdentity => mockPrivateIdentity('k')

/** webRtcLocalIdentity as a base64 string is between webRtcCannotInitiateIdentity and webRtcCanInitiateIdentity  */
export const webRtcLocalIdentity = (): PrivateIdentity => mockPrivateIdentity('l')

/** webRtcCannotInitiateIdentity as a base64 string is greater than webRtcLocalIdentity */
export const webRtcCannotInitiateIdentityPrivate = (): PrivateIdentity =>
  mockPrivateIdentity('m')
/**
 * Utility to create a fake "keypair" for testing the network layer
 */
export function mockPrivateIdentity(identity: string): PrivateIdentity {
  return {
    publicKey: Buffer.alloc(identityLength, identity, 'utf8'),
    secretKey: Buffer.alloc(identityLength, identity, 'utf8'),
  }
}
