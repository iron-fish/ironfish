/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { ethers } from 'ethers'
import { Assert } from '../../../assert'
import { ContractArtifact, GLOBAL_CONTRACT_ADDRESS } from '../../../evm'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/sendRawTransaction', () => {
  const routeTest = createRouteTest()
  const globalContract = new ethers.Interface(ContractArtifact.abi)
  const evmAccount = ethers.HDNodeWallet.fromSeed(
    Buffer.from('f92df72b4c3b1f4f29cfcb0874679b2154c1d686651dde2f3a72f9db54aced25', 'hex'),
  )

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
    const tx = new LegacyTransaction({
      nonce: 0n,
      to: evmSenderAddress,
      value: evmAccount.balance / 2n,
      gasLimit: 21000n,
      gasPrice: 7n,
    })
    const signed = tx.sign(evmPrivateKey)
    const response = await routeTest.client.eth.sendRawTransaction({
      transaction: Buffer.from(signed.serialize()).toString('hex'),
    })

    expect(response.status).toEqual(200)
    expect(response.content.hash).toEqual(Buffer.from(signed.hash()).toString('hex'))
    expect(response.content.ifHash).toBeDefined()
    expect(response.content.accepted).toEqual(true)
  })

  it('should construct an evm shield transaction and submit to node', async () => {
    const { wallet } = routeTest

    const ifReceivingAccount = await useAccountFixture(wallet, 'ifReceivingAccount')

    const encodedFunctionData = globalContract.encodeFunctionData('shield', [
      Buffer.from(ifReceivingAccount.publicAddress, 'hex'),
      2n,
      500n,
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      to: GLOBAL_CONTRACT_ADDRESS,
      gasLimit: 1000000n,
      gasPrice: 0n,
      data: encodedFunctionData,
    })

    const signed = tx.sign(Buffer.from(evmAccount.privateKey.replace(/0x/g, ''), 'hex'))

    const response = await routeTest.client.eth.sendRawTransaction({
      transaction: Buffer.from(signed.serialize()).toString('hex'),
    })

    expect(response.status).toEqual(200)
    expect(response.content.hash).toEqual(Buffer.from(signed.hash()).toString('hex'))
    expect(response.content.ifHash).toBeDefined()
    expect(response.content.accepted).toEqual(true)
  })
})
