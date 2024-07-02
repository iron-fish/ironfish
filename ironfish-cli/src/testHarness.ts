/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Jest } from '@jest/environment'
import type { JestExpect } from '@jest/expect'
import type { Global } from '@jest/types'

declare global {
  const {
    it,
    test,
    fit,
    xit,
    xtest,
    describe,
    xdescribe,
    fdescribe,
    beforeAll,
    beforeEach,
    afterEach,
    afterAll,
  }: Global.GlobalAdditions
  const expect: JestExpect
  const jest: Jest
}
