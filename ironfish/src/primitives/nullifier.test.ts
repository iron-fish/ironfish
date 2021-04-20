/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NullifierHasher } from './nullifier'

describe('NullifierHasher', () => {
  it('constructs a nullifier hasher', () => {
    expect(new NullifierHasher()).toMatchSnapshot()
  })

  it('calculates some hashes', () => {
    // These are arbitrary snapshots, but it tests that they don't change
    const nullifier = Buffer.alloc(32)
    expect(new NullifierHasher().merkleHash(nullifier)).toMatchSnapshot()
    nullifier[0] = 8
    expect(new NullifierHasher().merkleHash(nullifier)).toMatchSnapshot()
    nullifier[10] = 125
    expect(new NullifierHasher().merkleHash(nullifier)).toMatchSnapshot()
    nullifier[28] = 2
    expect(new NullifierHasher().merkleHash(nullifier)).toMatchSnapshot()
    nullifier[31] = 255
    expect(new NullifierHasher().merkleHash(nullifier)).toMatchSnapshot()
    expect(nullifier).toMatchSnapshot()
  })

  it('combines hashes', () => {
    const nullifier1 = Buffer.alloc(32)
    const nullifier2 = Buffer.alloc(32)
    expect(new NullifierHasher().combineHash(0, nullifier1, nullifier2)).toMatchSnapshot()
    nullifier1[0] = 8
    expect(new NullifierHasher().combineHash(5, nullifier1, nullifier2)).toMatchSnapshot()
    nullifier2[10] = 125
    expect(new NullifierHasher().combineHash(17, nullifier1, nullifier2)).toMatchSnapshot()
    nullifier1[28] = 2
    expect(new NullifierHasher().combineHash(31, nullifier1, nullifier2)).toMatchSnapshot()
    nullifier2[31] = 255
    expect(new NullifierHasher().combineHash(16, nullifier1, nullifier2)).toMatchSnapshot()
    expect(new NullifierHasher().combineHash(12, nullifier1, nullifier2)).toMatchSnapshot()
    expect(nullifier1).toMatchSnapshot()
    expect(nullifier2).toMatchSnapshot()
  })
})
