/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Bech32m } from './bech32m'

describe('Bech32m Decode/Encode', () => {
  it('succeed encoding / decoding', () => {
    const encoded = Bech32m.encode('barbaz', 'foo')
    expect(encoded).toEqual('foo1vfshycnp0gv5etqu')

    const [decoded] = Bech32m.decode(encoded)
    expect(decoded).toEqual('barbaz')
  })

  it('returns error when failure occurs', () => {
    const [, error] = Bech32m.decode('broken')
    expect(error).toBeInstanceOf(Error)
  })
})
