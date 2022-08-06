/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ErrorUtils } from '@ironfish/sdk'

const tryParseUrl = (url: string): URL | null => {
  try {
    return new URL(url)
  } catch (e) {
    if (e instanceof TypeError && ErrorUtils.isNodeError(e) && e.code === 'ERR_INVALID_URL') {
      return null
    }
    throw e
  }
}

function splitPathName(pathName: string): string[] {
  return pathName.split('/').filter((s) => !!s.trim())
}

function joinPathName(parts: string[]): string {
  return parts.join('/')
}

export const UrlUtils = { tryParseUrl, joinPathName, splitPathName }
