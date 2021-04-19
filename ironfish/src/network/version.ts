/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export const VERSION_PROTOCOL = 1
export const VERSION_SEPARATOR = '/'

/**
 * A peer version and its components
 */
export type Version = {
  product: string | null
  agent: string | null
  version: string | null
  code: string | null
}

/**
 * Returns true if `otherVersion` is compatible with `localVersion`.
 * "Compatible" means the peers can connect to each other.
 * @param otherVersion Another version string.
 */
export function versionsAreCompatible(localVersion: Version, otherVersion: Version): boolean {
  if (localVersion.product === null) return false
  if (otherVersion.product === null) return false
  if (localVersion.version === null) return false
  if (otherVersion.version === null) return false
  if (localVersion.agent === null) return false
  if (otherVersion.agent === null) return false
  return localVersion.version === otherVersion.version
}

/**
 * Returns the parsed version string components
 * @param peerVersion a peer version string
 */
export function parseVersion(peerVersion: string): Version {
  let ironfish: string | null = null
  let version: string | null = null
  let agent: string | null = null
  let code: string | null = null

  const split = peerVersion.split('/')
  if (split.length >= 1) ironfish = split[0]
  if (split.length >= 2) version = split[1]
  if (split.length >= 3) agent = split[2]
  if (split.length >= 4) code = split[3]

  return { product: ironfish, agent, version, code }
}

/**
 * Return version in string format in the form [product]/[version]/[agent]/[code]
 * Example: sdk/1/cli/eb4d5d3
 */
export function renderVersion(version: Version): string {
  let rendered =
    `${version.product || ''}` +
    `${VERSION_SEPARATOR}${version.version || ''}` +
    `${VERSION_SEPARATOR}${version.agent || ''}`

  if (version.code) {
    rendered += `${VERSION_SEPARATOR}${version.code}`
  }

  return rendered
}
