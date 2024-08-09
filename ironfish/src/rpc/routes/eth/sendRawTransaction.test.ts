/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { Assert } from '../../../assert'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/sendRawTransaction', () => {
  const routeTest = createRouteTest(false)

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
})
