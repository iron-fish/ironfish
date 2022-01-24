/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Block } from '../primitives/block'
import { BlockHeader } from '../primitives/blockheader'

function renderHashHex(hashHex: string | null | undefined): string {
  if (!hashHex) {
    return ''
  }

  /* Chop off leading zeroes of the hash */
  let n = 0
  while (hashHex.charAt(n) === '0') {
    n++
  }

  /* Overflow check on string end */
  if (n + 5 > hashHex.length) {
    /* We've exceeded the end of the string, so just revert to the beginning - it's all zeroes anyway. */
    n = 0
  }

  return `${hashHex.slice(n, n + 5)}...${hashHex.slice(-5)}`
}

function renderHash(hash: Buffer | null | undefined): string {
  if (!hash) {
    return ''
  }
  return renderHashHex(hash.toString('hex'))
}

function renderBlockHeaderHash(header: BlockHeader | null | undefined): string {
  if (!header) {
    return ''
  }
  return renderHash(header.hash)
}

function renderBlockHash(block: Block | null | undefined): string {
  if (!block) {
    return ''
  }
  return renderHash(block.header.hash)
}

export const HashUtils = {
  renderHashHex,
  renderHash,
  renderBlockHeaderHash,
  renderBlockHash,
}
