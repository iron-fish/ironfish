/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { BlockHeader, ChainProcessor } from '.'
import { Assert } from './assert'
import { createNodeTest } from './testUtilities'
import { makeBlockAfter } from './testUtilities/helpers/blockchain'

describe('ChainProcessor', () => {
  const nodeTest = createNodeTest()

  it('processes chain', async () => {
    const { strategy, chain } = nodeTest
    strategy.disableMiningReward()

    const genesis = await chain.getBlock(chain.genesis)
    Assert.isNotNull(genesis)

    const blockA1 = await makeBlockAfter(chain, genesis)
    const blockA2 = await makeBlockAfter(chain, blockA1)
    const blockA3 = await makeBlockAfter(chain, blockA2)
    const blockB1 = await makeBlockAfter(chain, genesis)
    const blockB2 = await makeBlockAfter(chain, blockB1)

    const processor = new ChainProcessor({
      chain: chain,
      head: genesis.header.hash,
    })

    const onEvent: jest.Mock<void, [BlockHeader, 'add' | 'remove']> = jest.fn()
    processor.onAdd.on((block) => onEvent(block, 'add'))
    processor.onRemove.on((block) => onEvent(block, 'remove'))

    await processor.update()
    expect(onEvent).toHaveBeenCalledTimes(0)

    // G -> A1
    await expect(chain).toAddBlock(blockA1)

    await processor.update()
    expect(onEvent).toHaveBeenNthCalledWith(1, blockA1.header, 'add')
    expect(onEvent).toHaveBeenCalledTimes(1)

    // G -> A1
    //   -> B1 -> B2
    await expect(chain).toAddBlock(blockB1)
    await expect(chain).toAddBlock(blockB2)

    await processor.update()
    expect(onEvent).toHaveBeenNthCalledWith(2, blockA1.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(3, blockB1.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(4, blockB2.header, 'add')
    expect(onEvent).toHaveBeenCalledTimes(4)

    // G -> A1 -> A2 -> A3
    //   -> B1 -> B2
    await expect(chain).toAddBlock(blockA2)
    await expect(chain).toAddBlock(blockA3)

    await processor.update()
    expect(onEvent).toHaveBeenNthCalledWith(5, blockB2.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(6, blockB1.header, 'remove')
    expect(onEvent).toHaveBeenNthCalledWith(7, blockA1.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(8, blockA2.header, 'add')
    expect(onEvent).toHaveBeenNthCalledWith(9, blockA3.header, 'add')
    expect(onEvent).toHaveBeenCalledTimes(9)
  })
})
