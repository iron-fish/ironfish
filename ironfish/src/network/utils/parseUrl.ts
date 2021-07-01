/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const PROTOCOL_SEPARATOR = '://'
const PORT_SEPARATOR = ':'

/**
 * Liberally parses a URL into its components and returns
 * null for a component if it is not present or invalid
 */
export function parseUrl(url: string): {
  protocol: string | null
  hostname: string | null
  port: number | null
} {
  url = url.trim()

  let protocol = null
  let hostname = null
  let port = null

  const protocolSepIndex = url.indexOf(PROTOCOL_SEPARATOR)
  if (protocolSepIndex !== -1) {
    protocol = url.slice(0, protocolSepIndex)
    url = url.slice(protocolSepIndex + PROTOCOL_SEPARATOR.length).trim()
  }

  const portSepIndex = url.indexOf(PORT_SEPARATOR)
  if (portSepIndex !== -1) {
    const value = Number(url.slice(portSepIndex + PORT_SEPARATOR.length).trim())
    url = url.slice(0, portSepIndex).trim()
    if (!isNaN(value)) {
      port = value
    }
  }

  if (url) {
    hostname = url
  }

  return { protocol, hostname, port }
}
