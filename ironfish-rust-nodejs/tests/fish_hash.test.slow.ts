/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FishHashContext } from '..'

describe('FishHashContext', () => {
  it('should be able to generate a new FishHash context', () => {
    const context = new FishHashContext(false)
    expect(context).toBeDefined()
  })

  it('should be able to hash a buffer', () => {
    let data = Buffer.from('the quick brown fox jumps over the lazy dog')
    const context = new FishHashContext(false)

    const hash = context.hash(data)
    expect(hash.toString('hex')).toEqual('6f4429716dc009d5d3b9775a4d6a5d58bccd9f73386bf88da7d5afdf5deb50f1')
  })
})
