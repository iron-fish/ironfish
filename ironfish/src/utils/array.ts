/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Assert } from '../assert'

function shuffle<T>(array: Array<T>): Array<T> {
  return array.slice().sort(() => Math.random() - 0.5)
}

function sampleOrThrow<T>(array: Array<T>): T {
  Assert.isTrue(array.length > 0)
  return array[Math.floor(Math.random() * array.length)]
}

function remove<T>(array: Array<T>, item: T): boolean {
  for (let i = 0; i < array.length; ++i) {
    if (array[i] === item) {
      array.splice(i, 1)
      return true
    }
  }
  return false
}

export const ArrayUtils = { shuffle, sampleOrThrow, remove }
