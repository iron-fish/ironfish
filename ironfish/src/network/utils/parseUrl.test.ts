/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseUrl } from './parseUrl'

describe('parseUrl', () => {
  it('should parse urls', () => {
    // all components
    expect(parseUrl('http://foo.bar:9033')).toMatchObject({
      protocol: 'http',
      hostname: 'foo.bar',
      port: 9033,
    })

    // Hostname
    expect(parseUrl('foo.bar')).toMatchObject({
      protocol: null,
      hostname: 'foo.bar',
      port: null,
    })

    // Port only
    expect(parseUrl(':9')).toMatchObject({
      protocol: null,
      hostname: null,
      port: 9,
    })

    // Protocol and port
    expect(parseUrl('http://:1')).toMatchObject({
      protocol: 'http',
      hostname: null,
      port: 1,
    })
  })

  it('should handle spaces', () => {
    expect(parseUrl(' foo ')).toMatchObject({
      protocol: null,
      hostname: 'foo',
      port: null,
    })

    expect(parseUrl('    http://foo   : 9033 ')).toMatchObject({
      protocol: 'http',
      hostname: 'foo',
      port: 9033,
    })
  })

  it('should handle invalid port', () => {
    expect(parseUrl('http://foo:notanumber')).toMatchObject({
      protocol: 'http',
      hostname: 'foo',
      port: null,
    })
  })
})
