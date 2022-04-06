/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isMessage, parseMessage } from './messages'

describe('parseMessage', () => {
  it('Throws error when no type field found in the json', () => {
    const msg = {
      payload: {
        position: 3,
      },
    }

    const output = JSON.stringify(msg)

    expect(() => parseMessage(output)).toThrow('Message must have a type field')
  })
})

describe('isMessage', () => {
  it('returns false on null parameter', () => {
    expect(isMessage(null)).toBeFalsy()
  })

  it('returns false when the message type is not a string', () => {
    const msg = {
      type: 0,
      payload: {
        position: 3,
      },
    }

    expect(isMessage(msg)).toBeFalsy()
  })
})
