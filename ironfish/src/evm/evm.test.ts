/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { Assert } from '../assert'
import { createNodeTest, useAccountFixture } from '../testUtilities'

describe('IronfishEvm', () => {
  describe('simulateTx', () => {
    const nodeTest = createNodeTest()

    it('returns true on evm transactions', async () => {
      const senderAccountIf = await useAccountFixture(nodeTest.node.wallet, 'sender')
      const recipientAccountIf = await useAccountFixture(nodeTest.node.wallet, 'recipient')

      const senderPrivateKey = Uint8Array.from(Buffer.from(senderAccountIf.spendingKey, 'hex'))
      const recipientPrivateKey = Uint8Array.from(
        Buffer.from(recipientAccountIf.spendingKey, 'hex'),
      )

      const senderAddress = Address.fromPrivateKey(senderPrivateKey)
      const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

      const senderAccountBefore = new EthAccount(BigInt(0), 500000n)

      await nodeTest.chain.blockchainDb.stateManager.checkpoint()
      await nodeTest.chain.blockchainDb.stateManager.putAccount(
        senderAddress,
        senderAccountBefore,
      )
      await nodeTest.chain.blockchainDb.stateManager.commit()

      const tx = new LegacyTransaction({
        to: recipientAddress,
        value: 200000n,
        gasLimit: 21000n,
        gasPrice: 7n,
      })
      const signed = tx.sign(senderPrivateKey)

      Assert.isNotUndefined(nodeTest.chain.evm)

      const result = await nodeTest.chain.evm.simulateTx({ tx: signed })

      expect(result.totalGasSpent).toEqual(21000n)

      const senderAccountAfter = await nodeTest.chain.blockchainDb.stateManager.getAccount(
        senderAddress,
      )

      expect(senderAccountAfter?.balance).toEqual(senderAccountBefore.balance)
    })
  })
})
