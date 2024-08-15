/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import ContractArtifact from '@ironfish/ironfish-contracts'
import { Asset } from '@ironfish/rust-nodejs'
import { ethers } from 'ethers'
import { Assert } from '../assert'
import { GLOBAL_CONTRACT_ADDRESS, GLOBAL_IF_ACCOUNT } from '../evm'
import { legacyTransactionToEvmDescription } from '../primitives'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../testUtilities'
import { AssertSpending, decodeAccountImport } from '../wallet'

jest.mock('ws')
jest.useFakeTimers()

describe('EVM Chain', () => {
  const nodeTest = createNodeTest()
  const globalContract = new ethers.Interface(ContractArtifact.abi)
  const evmAccount = ethers.HDNodeWallet.fromSeed(
    Buffer.from('f92df72b4c3b1f4f29cfcb0874679b2154c1d686651dde2f3a72f9db54aced25', 'hex'),
  )

  it('shields custom asset', async () => {
    nodeTest.network.consensus.parameters.enableEvmDescriptions = 1

    const { chain, wallet } = nodeTest

    const globalAccount = await wallet.importAccount(
      decodeAccountImport(GLOBAL_IF_ACCOUNT.spendingKey, { name: 'global' }),
    )
    AssertSpending(globalAccount)

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

    const description = legacyTransactionToEvmDescription(signed)

    const { events: evmEvents } = await chain.evm.simulateTx({ tx: signed })
    Assert.isNotUndefined(evmEvents)
    const raw = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description,
      evmEvents,
    })

    const transaction = raw.post(globalAccount.spendingKey)

    const block1 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction,
    ])

    await expect(chain).toAddBlock(block1)
    await wallet.scan()

    const balance = await ifReceivingAccount.getBalance(evmEvents[0].assetId, 0)
    expect(balance.available).toEqual(500n)
  })

  it('shields IRON', async () => {
    const { chain, wallet } = nodeTest
    nodeTest.network.consensus.parameters.enableEvmDescriptions = 1

    const globalAccount = await wallet.importAccount(
      decodeAccountImport(GLOBAL_IF_ACCOUNT.spendingKey, { name: 'global' }),
    )
    AssertSpending(globalAccount)

    const ifReceivingAccount = await useAccountFixture(wallet, 'ifReceivingAccount')

    // Give a public account 500 ORE
    await chain.blockchainDb.stateManager.checkpoint()
    await chain.blockchainDb.stateManager.putAccount(
      Address.fromString(evmAccount.address),
      new EthAccount(BigInt(0), 10_000_000_000n),
    )
    await chain.blockchainDb.stateManager.commit()

    const encodedFunctionData = globalContract.encodeFunctionData('shield_iron', [
      Buffer.from(ifReceivingAccount.publicAddress, 'hex'),
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      to: GLOBAL_CONTRACT_ADDRESS,
      gasLimit: 1000000n,
      gasPrice: 0n,
      value: 500n,
      data: encodedFunctionData,
    })

    const signed = tx.sign(Buffer.from(evmAccount.privateKey.replace(/0x/g, ''), 'hex'))

    const description = legacyTransactionToEvmDescription(signed)

    const { events: evmEvents } = await chain.evm.simulateTx({ tx: signed })
    Assert.isNotUndefined(evmEvents)
    const raw = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description,
      evmEvents,
    })

    const transaction = raw.post(globalAccount.spendingKey)

    const block1 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction,
    ])

    await expect(chain).toAddBlock(block1)
    await wallet.scan()

    const balance = await ifReceivingAccount.getBalance(Asset.nativeId(), 0)
    expect(balance.available).toEqual(500n)
  })

  it('unshields custom asset', async () => {
    nodeTest.network.consensus.parameters.enableEvmDescriptions = 1

    const { chain, wallet } = nodeTest

    const globalAccount = await wallet.importAccount(
      decodeAccountImport(GLOBAL_IF_ACCOUNT.spendingKey, { name: 'global' }),
    )
    AssertSpending(globalAccount)

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

    const description = legacyTransactionToEvmDescription(signed)

    const { events: evmEvents } = await chain.evm.simulateTx({ tx: signed })
    Assert.isNotUndefined(evmEvents)
    const raw = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description,
      evmEvents,
    })

    const transaction = raw.post(globalAccount.spendingKey)

    const block1 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction,
    ])

    await expect(chain).toAddBlock(block1)
    await wallet.scan()

    const balance = await ifReceivingAccount.getBalance(evmEvents[0].assetId, 0)
    expect(balance.available).toEqual(500n)

    const encodedFunctionData2 = globalContract.encodeFunctionData('unshield', [2n, 500n])

    const tx2 = new LegacyTransaction({
      nonce: 1n,
      to: GLOBAL_CONTRACT_ADDRESS,
      gasLimit: 1000000n,
      gasPrice: 0n,
      data: encodedFunctionData2,
    })

    const signed2 = tx2.sign(Buffer.from(evmAccount.privateKey.replace(/0x/g, ''), 'hex'))

    const description2 = legacyTransactionToEvmDescription(signed2)

    const { events: evmEvents2 } = await chain.evm.simulateTx({ tx: signed2 })
    Assert.isNotUndefined(evmEvents2)
    const raw2 = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description2,
      evmEvents: evmEvents2,
      account: ifReceivingAccount,
    })

    const transaction2 = raw2.post(ifReceivingAccount.spendingKey)

    const block2 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction2,
    ])

    await expect(chain).toAddBlock(block2)
    await wallet.scan()

    const balance2 = await ifReceivingAccount.getBalance(evmEvents2[0].assetId, 0)
    expect(balance2.available).toEqual(0n)
  })

  it('unshields IRON', async () => {
    const { chain, wallet } = nodeTest
    nodeTest.network.consensus.parameters.enableEvmDescriptions = 1

    const globalAccount = await wallet.importAccount(
      decodeAccountImport(GLOBAL_IF_ACCOUNT.spendingKey, { name: 'global' }),
    )
    AssertSpending(globalAccount)

    const ifSendingAccount = await useAccountFixture(wallet, 'ifSendingAccount')

    // Give private account some IRON
    const block = await useMinerBlockFixture(chain, undefined, ifSendingAccount)
    await expect(chain).toAddBlock(block)
    await wallet.scan()

    const encodedFunctionData = globalContract.encodeFunctionData('unshield_iron', [
      evmAccount.address,
      20n * 10n ** 8n,
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      to: GLOBAL_CONTRACT_ADDRESS,
      gasLimit: 1000000n,
      gasPrice: 0n,
      data: encodedFunctionData,
    })

    const signed = tx.sign(Buffer.from(evmAccount.privateKey.replace(/0x/g, ''), 'hex'))

    const description = legacyTransactionToEvmDescription(signed)

    const { events: evmEvents } = await chain.evm.simulateTx({ tx: signed }, 20n * 10n ** 8n)
    Assert.isNotUndefined(evmEvents)
    const raw = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description,
      evmEvents,
      account: ifSendingAccount,
    })

    const transaction = raw.post(ifSendingAccount.spendingKey)

    const block1 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction,
    ])

    await expect(chain).toAddBlock(block1)

    const balance = await chain.evm.getBalance(Address.fromString(evmAccount.address))

    expect(balance).toEqual(20n * 10n ** 8n)
  })

  it('unshields IRON and consumes gas', async () => {
    const { chain, wallet } = nodeTest
    nodeTest.network.consensus.parameters.enableEvmDescriptions = 1

    const globalAccount = await wallet.importAccount(
      decodeAccountImport(GLOBAL_IF_ACCOUNT.spendingKey, { name: 'global' }),
    )
    AssertSpending(globalAccount)

    const ifSendingAccount = await useAccountFixture(wallet, 'ifSendingAccount')

    // Give private account some IRON
    const block = await useMinerBlockFixture(chain, undefined, ifSendingAccount)
    await expect(chain).toAddBlock(block)
    await wallet.scan()

    const encodedFunctionData = globalContract.encodeFunctionData('unshield_iron', [
      evmAccount.address,
      20n * 10n ** 8n,
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      to: GLOBAL_CONTRACT_ADDRESS,
      gasLimit: 1000000n,
      // use gas price of 1n to require gas
      gasPrice: 1n,
      data: encodedFunctionData,
    })

    const signed = tx.sign(Buffer.from(evmAccount.privateKey.replace(/0x/g, ''), 'hex'))

    const description = legacyTransactionToEvmDescription(signed)

    const { events: evmEvents } = await chain.evm.simulateTx({ tx: signed }, 20n * 10n ** 8n)
    Assert.isNotUndefined(evmEvents)
    const raw = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description,
      evmEvents,
      account: ifSendingAccount,
    })

    const transaction = raw.post(ifSendingAccount.spendingKey)

    const block1 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction,
    ])

    await expect(chain).toAddBlock(block1)

    const balance = await chain.evm.getBalance(Address.fromString(evmAccount.address))

    // balance should reflect consumed gas
    expect(balance).toEqual(1999975646n)
  })
})
