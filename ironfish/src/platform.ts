/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Package } from './package'

/**
 * Get the current javascript engine type
 */
const getRuntime = ():
  | { type: 'node'; runtime: string }
  | { type: 'unknown'; runtime: string } => {
  if (
    typeof process === 'object' &&
    process &&
    process.release &&
    process.versions &&
    typeof process.versions.node === 'string'
  ) {
    return { type: 'node', runtime: process.versions.node }
  }

  return { type: 'unknown', runtime: 'unknown' }
}

/**
 * Returns a user agent that combines the name and version components
 *
 * ironfish-cli/0.1.19/src
 * ironfish-sdk/0.1.19/36c71af
 * ironfish-sdk/0.1.19/src
 */
const getAgent = (pkg: Package): string => {
  return `${pkg.name}/${pkg.version}/${pkg.git.slice(0, 8)}`
}

export const Platform = { getAgent, getRuntime }
