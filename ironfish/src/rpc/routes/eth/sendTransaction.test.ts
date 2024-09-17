/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { ethers } from 'ethers'
import { Assert } from '../../../assert'
import { ContractArtifact, GLOBAL_CONTRACT_ADDRESS } from '../../../evm'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/sendRawTransaction', () => {
  const routeTest = createRouteTest()
  const globalContract = new ethers.Interface(ContractArtifact.abi)

  it('should construct evm transaction and submit to node', async () => {
    const senderIf = await useAccountFixture(routeTest.node.wallet, 'sender')

    const evmPrivateKey = Uint8Array.from(Buffer.from(senderIf.spendingKey || '', 'hex'))

    const evmSenderAddress = Address.fromPrivateKey(evmPrivateKey)
    const senderAccount = new EthAccount(BigInt(0), 500_000_000n)

    await routeTest.node.chain.blockchainDb.stateManager.checkpoint()
    await routeTest.node.chain.blockchainDb.stateManager.putAccount(
      evmSenderAddress,
      senderAccount,
    )
    await routeTest.node.chain.blockchainDb.stateManager.commit()

    const evmAccount = await routeTest.node.chain.blockchainDb.stateManager.getAccount(
      evmSenderAddress,
    )
    Assert.isNotUndefined(evmAccount)

    const response = await routeTest.client.eth.sendTransaction([
      {
        nonce: '0x0',
        to: evmSenderAddress.toString(),
        from: evmSenderAddress.toString(),
        value: '0xEE6B280', // 250000000
      },
    ])

    expect(response.status).toEqual(200)
  })

  it('should construct an evm shield transaction and submit to node', async () => {
    const { wallet } = routeTest

    const ifReceivingAccount = await useAccountFixture(wallet, 'ifReceivingAccount')

    const encodedFunctionData = globalContract.encodeFunctionData('shield', [
      Buffer.from(ifReceivingAccount.publicAddress, 'hex'),
      2n,
      500n,
    ])

    const response = await routeTest.client.eth.sendTransaction([
      {
        to: GLOBAL_CONTRACT_ADDRESS.toString(),
        from: ifReceivingAccount.ethAddress!.toString(),
        data: encodedFunctionData,
      },
    ])

    expect(response.status).toEqual(200)
  })

  it('should construct a standard evm transaction and submit to node', async () => {
    const { wallet } = routeTest

    const ifReceivingAccount = await useAccountFixture(wallet, 'ifReceivingAccount')

    const response = await routeTest.client.eth.sendTransaction([
      {
        to: GLOBAL_CONTRACT_ADDRESS.toString(),
        from: ifReceivingAccount.ethAddress!.toString(),
      },
    ])

    expect(response.status).toEqual(200)
  })
})
