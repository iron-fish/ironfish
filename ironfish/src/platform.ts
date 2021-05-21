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

const getAgent = (name: string): string => {
  let agent = `if/${name}`
  if (Package.git) agent += `/${Package.git.slice(0, 8)}`
  return agent
}

export const Platform = { getAgent, getRuntime }
