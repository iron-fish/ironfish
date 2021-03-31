/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { canInitiateWebRTC, privateIdentityToIdentity } from '../identity'
import { webRtcCanInitiateIdentity, webRtcCannotInitiateIdentity } from './mockIdentity'
import { webRtcLocalIdentity } from './mockPrivateIdentity'

describe('mockIdentity', () => {
  it('should have identity that can initiate WebRTC', () => {
    const can = webRtcCanInitiateIdentity()
    const local = privateIdentityToIdentity(webRtcLocalIdentity())
    const cannot = webRtcCannotInitiateIdentity()

    // local is in the middle of the others
    expect(canInitiateWebRTC(local, can)).toBe(true)
    expect(canInitiateWebRTC(local, cannot)).toBe(false)

    // can is lower than the others
    expect(canInitiateWebRTC(can, local)).toBe(false)
    expect(canInitiateWebRTC(can, cannot)).toBe(false)

    // cannot is greater than the others
    expect(canInitiateWebRTC(cannot, local)).toBe(true)
    expect(canInitiateWebRTC(cannot, can)).toBe(true)

    // NO identity can initiate to itself
    expect(canInitiateWebRTC(can, can)).toBe(false)
    expect(canInitiateWebRTC(local, local)).toBe(false)
    expect(canInitiateWebRTC(cannot, cannot)).toBe(false)
  })
})
