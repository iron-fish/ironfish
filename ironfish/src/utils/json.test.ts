/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { JSONUtils, ParseJsonError } from './json'

describe('JSONUtils', () => {
  it('tryParse', () => {
    expect(JSONUtils.tryParse('')).toEqual([null, expect.any(ParseJsonError)])
    expect(JSONUtils.tryParse('foo')).toEqual([null, expect.any(ParseJsonError)])
    expect(JSONUtils.tryParse('{"foo"')).toEqual([null, expect.any(ParseJsonError)])
    expect(JSONUtils.tryParse('{}')).toEqual([{}, null])
    expect(JSONUtils.tryParse('{"foo":"bar"}')).toEqual([{ foo: 'bar' }, null])
  })
})
