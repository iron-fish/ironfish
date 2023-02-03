/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Bech32m } from './bech32m'

describe('Bech32m Decode/Encode', () => {
  it('succeed encoding/decoding when prefix provided', () => {
    const output = Bech32m.encode('barbaz', 'foo')
    expect(output[0]).toEqual('foo1vfshycnp0gv5etqu')
    if (!output[0]) {
      throw new Error('should return value')
    }
    const decoded = Bech32m.decode(output[0])
    if (!decoded[0]) {
      throw new Error('should have decoded')
    }
    expect(decoded[0]).toEqual('barbaz')
  })
  it('returns error when failure occurs', () => {
    const decoded = Bech32m.decode('broken')
    if (!decoded[1]) {
      throw new Error('should have thrown error')
    }
    expect(decoded[1]).toBeInstanceOf(Error)
  })
})
