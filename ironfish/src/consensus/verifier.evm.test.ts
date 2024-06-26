/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import '../testUtilities/matchers/blockchain'
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { generateKey } from '@ironfish/rust-nodejs'
import { DEVNET_GENESIS } from '../networks'
import { Transaction } from '../primitives'
import { EvmDescription, legacyTransactionToEvmDescription } from '../primitives/evmDescription'
import { TransactionVersion } from '../primitives/transaction'
import { createNodeTest, useAccountFixture, useTxSpendsFixture } from '../testUtilities'
import { Consensus } from './consensus'

describe('Verifier', () => {
  describe('Transaction', () => {
    const nodeTest = createNodeTest(undefined, {
      networkDefinition: {
        id: 1000,
        bootstrapNodes: [],
        genesis: DEVNET_GENESIS,
        consensus: {
          allowedBlockFutureSeconds: 15,
          genesisSupplyInIron: 42000000,
          targetBlockTimeInSeconds: 60,
          targetBucketTimeInSeconds: 10,
          maxBlockSizeBytes: 524288,
          minFee: 0,
          enableAssetOwnership: null,
          enableEvmDescriptions: 1,
          enforceSequentialBlockTime: 1,
          enableFishHash: null,
          enableIncreasedDifficultyChange: null,
          checkpoints: [],
        },
      },
    })

    it('returns true on normal transactions', async () => {
      const { transaction: tx } = await useTxSpendsFixture(nodeTest.node)
      const serialized = tx.serialize()

      const result = await nodeTest.chain.verifier.verifyNewTransaction(
        new Transaction(serialized),
      )

      expect(result).toEqual({ valid: true })
    })

    it.only('returns true on evm transactions', async () => {
      jest
        .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
        .mockImplementation(() => TransactionVersion.V3)

      const sender_account = await useAccountFixture(nodeTest.node.wallet, 'sender')
      const recipient_account = await useAccountFixture(nodeTest.node.wallet, 'recipient')

      const senderPrivateKey = Uint8Array.from(Buffer.from(sender_account.spendingKey, 'hex'))
      const recipientPrivateKey = Uint8Array.from(
        Buffer.from(recipient_account.spendingKey, 'hex'),
      )

      const senderAddress = Address.fromPrivateKey(senderPrivateKey)
      const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

      const senderAccount = new EthAccount(BigInt(0), 500000n)

      await nodeTest.chain.evm?.stateManager.checkpoint()
      await nodeTest.chain.evm?.stateManager.putAccount(senderAddress, senderAccount)
      await nodeTest.chain.evm?.stateManager.commit()

      console.log('senderAddress', senderAddress.toString())

      const tx = new LegacyTransaction({
        to: recipientAddress,
        value: 200000n,
        gasLimit: 21000n,
        gasPrice: 7n,
      })
      const signed = tx.sign(senderPrivateKey)
      console.log('legacy1', signed.toJSON())

      const evmDescription: EvmDescription = legacyTransactionToEvmDescription(signed)

      const raw = await nodeTest.wallet.createTransaction({
        account: sender_account,
        outputs: [],
        fee: 0n,
        expiration: 0,
        expirationDelta: 0,
        evm: evmDescription,
      })
      const transaction = raw.post(sender_account.spendingKey)
      const deserialized = new Transaction(transaction.serialize())
      const result = await nodeTest.chain.verifier.verifyNewTransaction(deserialized)

      expect(result).toEqual({ valid: true })
    })

    // it('returns false when evm transaction has invalid signature', async () => {
    //   jest
    //     .spyOn(nodeTest.wallet.consensus, 'getActiveTransactionVersion')
    //     .mockReturnValue(TransactionVersion.V3)

    //   const senderKey = generateKey()
    //   const receipientKey = generateKey()

    //   const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    //   const recipientPrivateKey = Uint8Array.from(Buffer.from(receipientKey.spendingKey, 'hex'))

    //   const senderAddress = Address.fromPrivateKey(senderPrivateKey)
    //   const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

    //   const senderAccount = new EthAccount(BigInt(0), 500000n)

    //   await nodeTest.chain.evm?.stateManager.checkpoint()
    //   await nodeTest.chain.evm?.stateManager.putAccount(senderAddress, senderAccount)
    //   await nodeTest.chain.evm?.stateManager.commit()

    //   const tx = new LegacyTransaction({
    //     to: recipientAddress,
    //     value: 200000n,
    //     gasLimit: 21000n,
    //     gasPrice: 7n,
    //   })
    //   const evmDescription: EvmDescription = legacyTransactionToEvmDescription(
    //     tx.sign(senderPrivateKey),
    //   )
    //   // break signature
    //   evmDescription.s = Buffer.alloc(32, 0)

    //   const { transaction } = await useTxSpendsFixture(nodeTest.node, { evm: evmDescription })
    //   const result = await nodeTest.chain.verifier.verifyNewTransaction(
    //     new Transaction(transaction.serialize()),
    //   )

    //   expect(result).toEqual({ valid: false })
    // })
  })
})
