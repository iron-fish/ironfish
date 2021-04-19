/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Package } from './package'
import { renderVersion, VERSION_PROTOCOL } from './network/version'

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
 * Combines the SDK's version with the name of the client using the SDK
 * to produce a version string usable by the peer network code.
 * @param agentName The name of the agent using the SDK. e.g. cli, browser
 */
const getAgent = (agentName: string): string => {
  return renderVersion({
    version: String(VERSION_PROTOCOL),
    product: 'ironfish',
    code: Package.git,
    agent: agentName,
  })
}

export const Platform = { getAgent, getRuntime }
