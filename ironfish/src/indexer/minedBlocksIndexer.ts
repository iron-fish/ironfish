/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Accounts } from '../account'
import { Assert } from '../assert'
import { Blockchain } from '../blockchain'
import { ChainProcessor } from '../chainProcessor'
import { FileSystem } from '../fileSystems'
import { createRootLogger, Logger } from '../logger'
import { BlockHeader } from '../primitives/blockheader'
import { IDatabaseStore, JsonEncoding, StringEncoding } from '../storage'
import { isBlockMine } from '../utils/blockchain'
import { Indexer } from './indexer'

export class MinedBlocksIndexer extends Indexer {
  protected minedBlocks: IDatabaseStore<{
    key: string
    value: { main: boolean; hash: string; sequence: number; account: string; minersFee: number }
  }>

  protected readonly accounts: Accounts
  readonly chain: Blockchain
  readonly chainProcessor: ChainProcessor
  protected readonly logger: Logger

  constructor({
    files,
    location,
    accounts,
    chain,
    chainProcessor,
    logger = createRootLogger(),
  }: {
    files: FileSystem
    location: string
    accounts: Accounts
    chain: Blockchain
    chainProcessor: ChainProcessor
    logger?: Logger
  }) {
    super({ files, location })
    this.accounts = accounts
    this.chain = chain
    this.chainProcessor = chainProcessor
    this.logger = logger

    this.minedBlocks = this.database.addStore<{
      key: string
      value: {
        main: boolean
        hash: string
        sequence: number
        account: string
        minersFee: number
      }
    }>({
      name: 'minedBlocks',
      keyEncoding: new StringEncoding(),
      valueEncoding: new JsonEncoding(),
    })

    this.chainProcessor.onAdd.on(async (header) => {
      const block = await chain.getBlock(header)
      Assert.isNotNull(block)

      const account = this.accounts.listAccounts().find((a) => isBlockMine(block, a))
      if (account) {
        const main = await this.chain.isHeadChain(header)
        const minersFee = this.chain.strategy.miningReward(header.sequence)

        await this.put(header, account.name, main, minersFee)
      }
    })

    this.chainProcessor.onRemove.on(async (header) => {
      if (await this.minedBlocks.has(header.hash.toString('hex'))) {
        const block = await chain.getBlock(header)
        Assert.isNotNull(block)

        const account = this.accounts.listAccounts().find((a) => isBlockMine(block, a))
        if (account) {
          const main = await this.chain.isHeadChain(header)
          const minersFee = this.chain.strategy.miningReward(header.sequence)

          await this.put(header, account.name, main, minersFee)
        }
      }
    })
  }

  async put(
    blockHeader: BlockHeader,
    accountName: string,
    main: boolean,
    minersFee: number,
  ): Promise<void> {
    await this.minedBlocks.put(blockHeader.hash.toString('hex'), {
      main,
      hash: blockHeader.hash.toString('hex'),
      sequence: blockHeader.sequence,
      account: accountName,
      minersFee,
    })
  }

  async remove(blockHeader: BlockHeader): Promise<void> {
    await this.minedBlocks.del(blockHeader.hash.toString('hex'))
  }

  async getBlock(hash: string): Promise<
    | {
        main: boolean
        hash: string
        sequence: number
        account: string
        minersFee: number
      }
    | undefined
  > {
    return this.minedBlocks.get(hash)
  }

  async loadMinedBlocks(includeForks?: boolean): Promise<
    {
      main: boolean
      hash: string
      sequence: number
      account: string
      minersFee: number
    }[]
  > {
    const minedBlocks = (await this.minedBlocks.getAllValues()).sort(
      (a, b) => a.sequence - b.sequence,
    )

    if (includeForks) {
      return minedBlocks
    }

    return minedBlocks.filter((block) => block.main === true)
  }
}
