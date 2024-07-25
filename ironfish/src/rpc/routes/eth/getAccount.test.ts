/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { CurrencyUtils } from '../../../utils'

describe('Route eth/getAccount', () => {
  const routeTest = createRouteTest(false)

  it('should fetch account data at the current head', async () => {
    const { node } = routeTest
    node.chain.consensus.parameters.enableEvmDescriptions = 2

    const account = await useAccountFixture(node.wallet, 'test')
    const address = Address.fromPrivateKey(Buffer.from(account.spendingKey, 'hex'))
    const ethAccount = new EthAccount(0n, 10n)

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(address, ethAccount)
    await node.chain.blockchainDb.stateManager.commit()

    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    expect(block2.header.stateCommitment).toBeDefined()
    await expect(node.chain).toAddBlock(block2)

    const response = await routeTest.client.eth.getAccount({
      address: address.toString(),
      blockReference: '2',
    })

    expect(response.status).toEqual(200)
    expect(response.content.balance).toEqual(CurrencyUtils.encode(ethAccount.balance))
    expect(response.content.nonce).toEqual(String(ethAccount.nonce))
  })

  it('should fetch account data at past blocks', async () => {
    const { node } = routeTest
    node.chain.consensus.parameters.enableEvmDescriptions = 2

    const account = await useAccountFixture(node.wallet, 'test2')
    const address = Address.fromPrivateKey(Buffer.from(account.spendingKey, 'hex'))
    const ethAccount1 = new EthAccount(0n, 1n)

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(address, ethAccount1)
    await node.chain.blockchainDb.stateManager.commit()

    const block2 = await useMinerBlockFixture(node.chain, 2, account)

    expect(block2.header.stateCommitment).toBeDefined()
    await expect(node.chain).toAddBlock(block2)

    const ethAccount2 = new EthAccount(0n, 2n)

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(address, ethAccount2)
    await node.chain.blockchainDb.stateManager.commit()

    const block3 = await useMinerBlockFixture(node.chain, 3, account)

    expect(block3.header.stateCommitment).toBeDefined()
    await expect(node.chain).toAddBlock(block3)

    const response = await routeTest.client.eth.getAccount({
      address: address.toString(),
      blockReference: '2',
    })

    expect(response.status).toEqual(200)
    expect(response.content.balance).toEqual(CurrencyUtils.encode(ethAccount1.balance))
    expect(response.content.nonce).toEqual(String(ethAccount1.nonce))
  })
})
