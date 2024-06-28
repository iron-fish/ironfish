/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

jest.mock('ws')

import '../testUtilities/matchers/blockchain'
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import { IronfishEvm } from '../evm'
import { FullNode } from '../node'
import { Transaction } from '../primitives'
import { EvmDescription, legacyTransactionToEvmDescription } from '../primitives/evmDescription'
import { TransactionVersion } from '../primitives/transaction'
import { createNodeTest, useAccountFixture } from '../testUtilities'
import { Account } from '../wallet'
import { Consensus } from './consensus'
import { VerificationResultReason } from './verifier'

describe('Verifier', () => {
  describe('EVM Transaction', () => {
    const nodeTest = createNodeTest()
    let node: FullNode
    let senderAccountIf: Account
    let evmDescription: EvmDescription

    beforeEach(async () => {
      const { node: n } = await nodeTest.createSetup()
      node = n
      jest
        .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
        .mockImplementation(() => TransactionVersion.V3)

      senderAccountIf = await useAccountFixture(node.wallet, 'sender')
      const recipientAccountIf = await useAccountFixture(node.wallet, 'recipient')

      const senderPrivateKey = Uint8Array.from(
        Buffer.from(senderAccountIf.spendingKey || '', 'hex'),
      )
      const recipientPrivateKey = Uint8Array.from(
        Buffer.from(recipientAccountIf.spendingKey, 'hex'),
      )

      const senderAddress = Address.fromPrivateKey(senderPrivateKey)
      const recipientAddress = Address.fromPrivateKey(recipientPrivateKey)

      const senderAccount = new EthAccount(BigInt(0), 500000n)

      await nodeTest.chain.blockchainDb.stateManager.checkpoint()
      await nodeTest.chain.blockchainDb.stateManager.putAccount(senderAddress, senderAccount)
      await nodeTest.chain.blockchainDb.stateManager.commit()

      const tx = new LegacyTransaction({
        to: recipientAddress,
        value: 200000n,
        gasLimit: 21000n,
        gasPrice: 7n,
      })
      const signed = tx.sign(senderPrivateKey)

      evmDescription = legacyTransactionToEvmDescription(signed)
    })

    it('returns true on evm transactions', async () => {
      const raw = await node.wallet.createTransaction({
        account: senderAccountIf,
        outputs: [],
        fee: 0n,
        expiration: 0,
        expirationDelta: 0,
        evm: evmDescription,
      })
      const transaction = raw.post(senderAccountIf.spendingKey || '')
      const deserialized = new Transaction(transaction.serialize())
      const result = await node.chain.verifier.verifyNewTransaction(deserialized)

      expect(result).toEqual({ valid: true })
    })

    it('returns false on global account mint non-evm', async () => {
      const mint = {
        creator: IronfishEvm.publicAddress,
        name: '0x00000000000000000000000000000000002cd37f',
        metadata: '',
        value: 1n,
      }
      const raw = await node.wallet.createTransaction({
        account: senderAccountIf,
        outputs: [],
        mints: [mint],
        fee: 0n,
        expiration: 0,
        expirationDelta: 0,
      })
      const transaction = raw.post(senderAccountIf.spendingKey || '')
      const deserialized = new Transaction(transaction.serialize())
      const result = await node.chain.verifier.verifyNewTransaction(deserialized)

      expect(result).toEqual({
        valid: false,
        reason: VerificationResultReason.EVM_MINT_NON_EVM,
      })
    })

    // TODO(jwp): test mint/burn mismatch balance/length

    it('returns false when evm transaction has invalid signature', async () => {
      // Change the signature to be invalid
      const busted = { ...evmDescription, s: Buffer.alloc(32) }

      const raw = await node.wallet.createTransaction({
        account: senderAccountIf,
        outputs: [],
        fee: 0n,
        expiration: 0,
        expirationDelta: 0,
        evm: busted,
      })
      const transaction = raw.post(senderAccountIf.spendingKey || '')
      const deserialized = new Transaction(transaction.serialize())
      const result = await node.chain.verifier.verifyNewTransaction(deserialized)

      expect(result).toEqual({
        valid: false,
        reason: VerificationResultReason.EVM_TRANSACTION_INVALID_SIGNATURE,
      })
    })
  })
})
