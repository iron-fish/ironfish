/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import supportsHyperlinks from 'supports-hyperlinks'

export function linkText(url: string, text: string, stdout = true): string {
  const supported = stdout ? supportsHyperlinks.stdout : supportsHyperlinks.stderr

  if (!supported) {
    return url
  }

  const OSC = '\u001B]'
  const BEL = '\u0007'
  const SEP = ';'

  return [OSC, '8', SEP, SEP, url, BEL, text, OSC, '8', SEP, SEP, BEL].join('')
}
