/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { networkIdentifier } from '../config'
import { isValidNetworkIdentifier } from './networkIdentifierUtil'

describe('isValidNetworkIdentifier util', () => {
  it(`returns false if it's not valid`, () => {
    expect(
      isValidNetworkIdentifier({ blockchain: 'this is not iron fish', network: 'staging' }),
    ).toBe(false)
  })

  it(`returns true if it's valid`, () => {
    expect(isValidNetworkIdentifier(networkIdentifier)).toBe(true)
  })
})
