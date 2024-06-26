/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { BlockchainDB } from '../blockchain/database/blockchaindb'
import { BlockHeader } from '../primitives'

class MockBlock {
  header: BlockHeader

  constructor(header: BlockHeader) {
    this.header = header
  }

  hash(): Uint8Array {
    return this.header.hash
  }
}

export class EvmBlockchain {
  blockchainDb: BlockchainDB

  constructor(blockchainDb: BlockchainDB) {
    this.blockchainDb = blockchainDb
  }

  async getBlock(sequence: number): Promise<MockBlock> {
    const header = await this.blockchainDb.getBlockHeaderAtSequence(sequence)

    Assert.isNotUndefined(header)

    return new MockBlock(header)
  }

  shallowCopy(): EvmBlockchain {
    return new EvmBlockchain(this.blockchainDb)
  }
}
