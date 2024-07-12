/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { BlockHeader } from '../primitives'

class EVMBlock {
  header: BlockHeader

  constructor(header: BlockHeader) {
    this.header = header
  }

  hash(): Uint8Array {
    return this.header.hash
  }
}

export class EVMBlockchain {
  blockchainDb: BlockchainDB

  constructor(blockchainDb: BlockchainDB) {
    this.blockchainDb = blockchainDb
  }

  async getBlock(sequence: number): Promise<EVMBlock> {
    const header = await this.blockchainDb.getBlockHeaderAtSequence(sequence)

    Assert.isNotUndefined(header)

    return new EVMBlock(header)
  }

  shallowCopy(): EVMBlockchain {
    console.log('shallowcopy called')
    return new EVMBlockchain(this.blockchainDb)
  }
}
