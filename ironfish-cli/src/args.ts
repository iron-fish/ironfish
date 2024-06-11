/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { parseUrl as parseUrlSdk } from '@ironfish/sdk'
import { Args } from '@oclif/core'

type Url = {
  protocol: string | null
  hostname: string
  port: number | null
}

export function parseUrl(input: string): Promise<Url> {
  const parsed = parseUrlSdk(input)
  if (parsed.hostname != null) {
    return Promise.resolve(parsed as Url)
  } else {
    return Promise.reject(new Error(`Invalid URL: ${input}`))
  }
}

/**
 * Oclif currently rejects falsy args as if they weren't included,
 * so this function returns the strings 'true' or 'false' instead. This
 * is fixed in newer versions of oclif.
 */
export function parseBoolean(input: string): 'true' | 'false' | null {
  const lower = input.toLowerCase().trim()
  if (lower === 'true' || lower === 'false') {
    return lower
  }
  return null
}

export const UrlArg = Args.custom<Url>({
  parse: async (input: string) => parseUrl(input),
})
