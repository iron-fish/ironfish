/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route chain/broadcastTransaction', () => {
  const routeTest = createRouteTest()

  it('does not broadcast when the peer network is not ready', async () => {
    const { node } = routeTest

    const account = await useAccountFixture(node.wallet)
    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    await node.chain.addBlock(block2)
    await node.wallet.scan()

    const transaction = await useTxFixture(node.wallet, account, account)

    jest.spyOn(routeTest.peerNetwork, 'isReady', 'get').mockImplementationOnce(() => false)

    const broadcastSpy = jest.spyOn(routeTest.peerNetwork, 'broadcastTransaction')

    const response = await routeTest.client.chain.broadcastTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content?.hash).toEqual(transaction.hash().toString('hex'))
    expect(response.content?.broadcasted).toEqual(false)
    expect(broadcastSpy).not.toHaveBeenCalled()
  })

  it('should broadcast a transaction', async () => {
    const { node } = routeTest
    jest.spyOn(routeTest.peerNetwork, 'isReady', 'get').mockImplementationOnce(() => true)

    const account = await useAccountFixture(node.wallet)
    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    await node.chain.addBlock(block2)
    await node.wallet.scan()

    const transaction = await useTxFixture(node.wallet, account, account)

    const broadcastSpy = jest.spyOn(routeTest.peerNetwork, 'broadcastTransaction')

    const response = await routeTest.client.chain.broadcastTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content?.hash).toEqual(transaction.hash().toString('hex'))
    expect(broadcastSpy).toHaveBeenCalled()
  })

  it("should return an error if the transaction won't deserialize", async () => {
    jest.spyOn(routeTest.peerNetwork, 'isReady', 'get').mockImplementationOnce(() => true)
    await expect(
      routeTest.client.chain.broadcastTransaction({
        transaction: '0xdeadbeef',
      }),
    ).rejects.toThrow('Out of bounds read')
  })

  it('should not broadcast double spend transactions', async () => {
    const { node } = routeTest
    jest.spyOn(routeTest.peerNetwork, 'isReady', 'get').mockImplementationOnce(() => true)

    const account = await useAccountFixture(node.wallet)
    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    await node.chain.addBlock(block2)
    await node.wallet.scan()

    const transaction = await useTxFixture(node.wallet, account, account)

    // add transaction to the chain
    const block3 = await useMinerBlockFixture(node.chain, 3, undefined, undefined, [
      transaction,
    ])
    await node.chain.addBlock(block3)

    // delete transaction, create duplicate transaction
    await account.deleteTransaction(transaction)

    const doubleSpendTransaction = await useTxFixture(node.wallet, account, account)

    await expect(
      routeTest.client.chain.broadcastTransaction({
        transaction: doubleSpendTransaction.serialize().toString('hex'),
      }),
    ).rejects.toThrow()
  })

  it('should add transaction to mempool and return the result', async () => {
    const { node } = routeTest
    jest.spyOn(routeTest.peerNetwork, 'isReady', 'get').mockImplementationOnce(() => true)

    const account = await useAccountFixture(node.wallet)
    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    await node.chain.addBlock(block2)
    await node.wallet.scan()

    const transaction = await useTxFixture(node.wallet, account, account)

    const acceptSpy = jest.spyOn(routeTest.node.memPool, 'acceptTransaction')

    const response = await routeTest.client.chain.broadcastTransaction({
      transaction: transaction.serialize().toString('hex'),
    })

    expect(response.status).toBe(200)
    expect(response.content?.hash).toEqual(transaction.hash().toString('hex'))
    expect(response.content?.accepted).toBe(true)
    expect(acceptSpy).toHaveBeenCalled()
  })
})
