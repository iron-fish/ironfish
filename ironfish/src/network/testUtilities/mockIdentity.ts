/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Identity, privateIdentityToIdentity } from '../identity'
import {
  mockPrivateIdentity,
  webRtcCanInitiateIdentityPrivate,
  webRtcCannotInitiateIdentityPrivate,
} from './mockPrivateIdentity'

// The identities here are in order of:
// Lowest:   webRtcCanInitiateIdentity
// Middle:   webRtcLocalIdentity
// Greatest: webRtcCannotInitiateIdentity

/** webRtcCannotInitiateIdentity as a base64 string is greater than webRtcLocalIdentity */
export const webRtcCannotInitiateIdentity = (): Identity =>
  privateIdentityToIdentity(webRtcCannotInitiateIdentityPrivate())

/** webRtcCanInitiateIdentity as a base64 string is less than webRtcLocalIdentity */
export const webRtcCanInitiateIdentity = (): Identity =>
  privateIdentityToIdentity(webRtcCanInitiateIdentityPrivate())

/**
 * Utility to mock a public-facing identity.
 */
export function mockIdentity(identity: string): Identity {
  return privateIdentityToIdentity(mockPrivateIdentity(identity))
}
