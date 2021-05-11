/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishBlock } from '../primitives/block'
import { IronfishBlockHeader } from '../primitives/blockheader'

function renderHashHex(hashHex: string): string {
  return `${hashHex.slice(0, 5)}...${hashHex.slice(-5)}`
}

function renderHash(hash: Buffer): string {
  return renderHashHex(hash.toString('hex'))
}

function renderBlockHeaderHash(header: IronfishBlockHeader): string {
  return renderHash(header.hash)
}

function renderBlockHash(block: IronfishBlock): string {
  return renderHash(block.header.hash)
}

export const HashUtils = { renderHashHex, renderHash, renderBlockHeaderHash, renderBlockHash }
