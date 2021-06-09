/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishBlock } from '../primitives/block'
import { IronfishBlockHeader } from '../primitives/blockheader'

function renderHashHex(hashHex: string | null | undefined): string {
  if (!hashHex) return ''
  return `${hashHex.slice(0, 5)}...${hashHex.slice(-5)}`
}

function renderHash(hash: Buffer | null | undefined): string {
  if (!hash) return ''
  return renderHashHex(hash.toString('hex'))
}

function renderBlockHeaderHash(header: IronfishBlockHeader | null | undefined): string {
  if (!header) return ''
  return renderHash(header.hash)
}

function renderBlockHash(block: IronfishBlock | null | undefined): string {
  if (!block) return ''
  return renderHash(block.header.hash)
}

function renderGraffiti(graffiti: Buffer): string {
  return graffiti.toString('utf8').replace(/\0/g, '').trim()
}

export const HashUtils = {
  renderGraffiti,
  renderHashHex,
  renderHash,
  renderBlockHeaderHash,
  renderBlockHash,
}
