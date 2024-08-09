/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { createNodeTest, useAccountFixture } from '../testUtilities'
import { EvmStateEncoding, HexStringEncoding } from './database'

describe('IronfishEvm', () => {
  describe('copy', () => {
    const nodeTest = createNodeTest()

    it('does not modify database', async () => {
      const mockStateStore = nodeTest.chain.blockchainDb.db.addStore(
        {
          name: 'evm',
          keyEncoding: new HexStringEncoding(),
          valueEncoding: new EvmStateEncoding(),
        },
        false,
      )

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

      const dbSizeBefore = (await mockStateStore.getAllKeys()).length

      Assert.isNotUndefined(nodeTest.chain.evm)

      const evmCopy = await nodeTest.chain.evm.copy()
      const result = await evmCopy.runTx({ tx: signed })

      expect(result?.result?.totalGasSpent).toEqual(21000n)

      const senderAccountAfter = await nodeTest.chain.blockchainDb.stateManager.getAccount(
        senderAddress,
      )
      expect(senderAccountAfter?.balance).toEqual(senderAccountBefore.balance)

      const dbSizeAfter = (await mockStateStore.getAllKeys()).length
      expect(dbSizeAfter).toEqual(dbSizeBefore)
    })
  })

  describe('getBalance', () => {
    const nodeTest = createNodeTest()

    it('fetches the account balance at the current state root', async () => {
      const key = generateKey()

      const address = Address.fromPrivateKey(Buffer.from(key.spendingKey, 'hex'))

      const { node } = nodeTest

      await node.chain.blockchainDb.stateManager.checkpoint()
      await node.chain.blockchainDb.stateManager.putAccount(address, new EthAccount(0n, 10n))
      await node.chain.blockchainDb.stateManager.commit()

      const balance = await node.chain.evm.getBalance(address)

      expect(balance).toEqual(10n)
    })

    it('fetches the account balance at the past state roots', async () => {
      const key = generateKey()

      const address = Address.fromPrivateKey(Buffer.from(key.spendingKey, 'hex'))

      const { node } = nodeTest

      await node.chain.blockchainDb.stateManager.checkpoint()
      await node.chain.blockchainDb.stateManager.putAccount(address, new EthAccount(0n, 10n))
      await node.chain.blockchainDb.stateManager.commit()

      const stateRoot = await node.chain.blockchainDb.stateManager.getStateRoot()

      await node.chain.blockchainDb.stateManager.checkpoint()
      await node.chain.blockchainDb.stateManager.putAccount(address, new EthAccount(0n, 20n))
      await node.chain.blockchainDb.stateManager.commit()

      const pastBalance = await node.chain.evm.getBalance(address, stateRoot)
      expect(pastBalance).toEqual(10n)

      const currentBalance = await node.chain.evm.getBalance(address)
      expect(currentBalance).toEqual(20n)
    })
  })
})
