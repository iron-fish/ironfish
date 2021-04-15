/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { makeBlockAfter } from '../testUtilities/fake'
import { createNodeTest } from '../testUtilities'

describe('Accounts', () => {
  const nodeTest = createNodeTest()

  it('sync account head', async () => {
    const { node, chain, strategy } = nodeTest
    strategy.disableMiningReward()

    const getTransactionsSpy = jest.spyOn(chain, 'getTransactionsForBlock')

    // G
    await node.seed()
    const genesis = await chain.getGenesisHeader()
    Assert.isNotNull(genesis)

    // G -> A1
    const blockA1 = await makeBlockAfter(chain, genesis)
    await chain.addBlock(blockA1)

    await node.accounts.updateHead()
    expect(node.accounts['headHash']).toEqual(blockA1.header.hash.toString('hex'))
    expect(getTransactionsSpy).toBeCalledTimes(2)

    // G -> A1 -> A2
    const blockA2 = await makeBlockAfter(chain, blockA1)
    await chain.addBlock(blockA2)

    await node.accounts.updateHead()
    expect(node.accounts['headHash']).toEqual(blockA2.header.hash.toString('hex'))
    expect(getTransactionsSpy).toBeCalledTimes(3)

    // Add 3 more on a heavier fork. Chain A should be removed first, then chain B added
    // G -> A1 -> A2
    //   -> B1 -> B2 -> B3
    const blockB1 = await makeBlockAfter(chain, genesis)
    const blockB2 = await makeBlockAfter(chain, blockB1)
    const blockB3 = await makeBlockAfter(chain, blockB2)
    await chain.addBlock(blockB1)
    await chain.addBlock(blockB2)
    await chain.addBlock(blockB3)

    await node.accounts.updateHead()
    expect(node.accounts['headHash']).toEqual(blockB3.header.hash.toString('hex'))
    expect(getTransactionsSpy).toBeCalledTimes(8)
  }, 8000)
})
