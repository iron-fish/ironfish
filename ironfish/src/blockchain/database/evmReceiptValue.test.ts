/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account as EthAccount, Address } from '@ethereumjs/util'
import ContractArtifact from '@ironfish/ironfish-contracts'
import { ethers } from 'ethers'
import { Assert } from '../../assert'
import { GLOBAL_CONTRACT_ADDRESS } from '../../evm'
import { createNodeTest, useAccountFixture } from '../../testUtilities'
import { EvmReceiptValueEncoding, runTxResultToEvmReceipt } from './evmReceiptValue'

describe('EvmReceiptValueEncoding', () => {
  const nodeTest = createNodeTest()

  it('serializes the value into a buffer and deserializes to the original value', async () => {
    const { chain, wallet } = nodeTest
    nodeTest.network.consensus.parameters.enableEvmDescriptions = 1

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    const evmAccount = ethers.HDNodeWallet.fromSeed(
      Buffer.from('f92df72b4c3b1f4f29cfcb0874679b2154c1d686651dde2f3a72f9db54aced25', 'hex'),
    )

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

    const result = await chain.evm.simulateTx({ tx: signed })

    Assert.isNotUndefined(result.result)

    const evmReceiptValue = runTxResultToEvmReceipt(result.result)

    const encoder = new EvmReceiptValueEncoding()

    const serialized = encoder.serialize(evmReceiptValue)
    const deserialized = encoder.deserialize(serialized)

    expect(deserialized).toEqual(evmReceiptValue)
  })
})
