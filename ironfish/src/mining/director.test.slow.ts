/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { waitForEmit } from '../event'
import { Target } from '../primitives/target'
import PartialBlockHeaderSerde from '../serde/PartialHeaderSerde'
import { createNodeTest } from '../testUtilities'
import { makeBlockAfter } from '../testUtilities/helpers/blockchain'

describe('Mining director', () => {
  const nodeTest = createNodeTest()

  beforeEach(async () => {
    await nodeTest.node.miningDirector.start()
  })

  afterEach(() => {
    nodeTest.node.miningDirector.shutdown()
  })

  it('creates a new block to be mined when chain head changes', async () => {
    // This test is testing the partially constructed
    // block that's created to be mined is reasonably
    // correct when emitted from MiningDirector.onBlockToMine
    const { chain, miningDirector, accounts } = nodeTest.node
    const account = await accounts.createAccount('')
    nodeTest.strategy.disableMiningReward()
    miningDirector.force = true
    miningDirector.setBlockGraffiti('testing')
    miningDirector.setMinerAccount(account)

    // Freeze time so we can predict the target
    const now = Date.now()
    jest.spyOn(global.Date, 'now').mockReturnValue(now)

    jest.spyOn(miningDirector.onBlockToMine, 'emit')

    const promise = waitForEmit(miningDirector.onBlockToMine)
    const previous = await makeBlockAfter(chain, chain.head)

    await expect(chain).toAddBlock(previous)
    const [event] = await promise

    const partial = new PartialBlockHeaderSerde(chain.strategy).deserialize(event.bytes)

    expect(event.target.targetValue).toEqual(
      Target.calculateTarget(new Date(now), previous.header.timestamp, previous.header.target)
        .targetValue,
    )

    expect(partial.previousBlockHash.equals(previous.header.hash)).toBe(true)
    expect(partial.minersFee).toEqual(BigInt(0))
    expect(partial.timestamp.valueOf()).toEqual(now)
  }, 10000)
})
