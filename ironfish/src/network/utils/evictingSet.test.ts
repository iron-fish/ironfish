/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import EvictingSet from './evictingSet'

it('Constructs an EvictingSet with no elements', () => {
  const set = new EvictingSet(5)
  expect(set).toMatchSnapshot()
})

it('Adds an element to an EvictingSet', () => {
  const set = new EvictingSet(5)
  set.add('a')
  expect(set).toMatchSnapshot()
})

it('Removes an element once max size is reached', () => {
  const set = new EvictingSet(5)
  set.add('a')
  set.add('b')
  set.add('c')
  set.add('d')
  set.add('e')
  set.add('f')
  set.add('g')
  set.add('h')
  set.add('i')
  set.add('j')
  set.add('k')
  expect(set).toMatchSnapshot()
})
