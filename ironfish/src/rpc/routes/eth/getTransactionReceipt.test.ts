/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Log } from '@ethereumjs/evm'
import { LegacyTransaction } from '@ethereumjs/tx'
import { bytesToHex, hexToBytes } from '@ethereumjs/util'
import { Asset } from '@ironfish/rust-nodejs'
import { ethers } from 'ethers'
import { Assert } from '../../../assert'
import { Consensus } from '../../../consensus'
import { ContractArtifact, GLOBAL_CONTRACT_ADDRESS } from '../../../evm'
import { TransactionVersion } from '../../../primitives'
import {
  evmDescriptionToLegacyTransaction,
  legacyTransactionToEvmDescription,
} from '../../../primitives/evmDescription'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EthUtils } from '../../../utils'

describe('Route eth/getTransactionReceipt', () => {
  const routeTest = createRouteTest()

  beforeAll(() => {
    jest
      .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
      .mockImplementation(() => TransactionVersion.V3)
  })

  it('should call retrieve correct block/transaction info', async () => {
    const { chain, wallet } = routeTest.node

    const account = await useAccountFixture(wallet)
    Assert.isNotNull(account.ethAddress)

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    // Give account some IRON
    const block = await useMinerBlockFixture(chain, undefined, account)
    await expect(chain).toAddBlock(block)
    await wallet.scan()

    const encodedFunctionData = globalContract.encodeFunctionData('unshield_iron', [
      account.ethAddress,
      20n * 10n ** 8n,
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      to: GLOBAL_CONTRACT_ADDRESS,
      gasLimit: 1000000n,
      gasPrice: 0n,
      data: encodedFunctionData,
    })

    const signed = tx.sign(Buffer.from(account.spendingKey, 'hex'))

    const description = legacyTransactionToEvmDescription(signed)

    const { result: runTxResult, events: evmEvents } = await chain.evm.simulateTx({
      tx: signed,
    })
    Assert.isNotUndefined(evmEvents)
    const raw = await wallet.createEvmTransaction({
      expiration: 0,
      expirationDelta: 0,
      evm: description,
      evmEvents,
      account,
    })

    const transaction = raw.post(account.spendingKey)

    const block1 = await useMinerBlockFixture(chain, undefined, undefined, undefined, [
      transaction,
    ])

    await expect(chain).toAddBlock(block1)

    const ethHash = evmDescriptionToLegacyTransaction(transaction.evm!).hash()
    const result = await routeTest.client.eth.getTransactionReceipt([bytesToHex(ethHash)])

    expect(result.status).toEqual(200)
    expect(result.content).toMatchObject({
      transactionHash: bytesToHex(ethHash),
      transactionIndex: '0x1',
      blockHash: EthUtils.prefix0x(block1.header.hash.toString('hex')),
      blockNumber: '0x3',
      from: EthUtils.prefix0x(account.ethAddress),
      to: EthUtils.prefix0x('f'.repeat(40)),
      cumulativeGasUsed: '0x7a1a',
      effectiveGasPrice: '0x0',
      gasUsed: '0x25be',
      contractAddress: null,
      logs: [
        expect.objectContaining({
          transactionHash: bytesToHex(ethHash),
          transactionIndex: '0x1',
          blockHash: EthUtils.prefix0x(block1.header.hash.toString('hex')),
          blockNumber: '0x3',
          address: EthUtils.prefix0x('f'.repeat(40)),
        }),
      ],
      logsBloom: bytesToHex(runTxResult.bloom.bitvector),
      type: '0x0',
      status: '0x1',
    })

    expect(result.content.logs).toHaveLength(1)

    const resultLog = result.content.logs[0]

    const log: Log = [
      hexToBytes(resultLog.address),
      resultLog.topics.map(hexToBytes),
      hexToBytes(resultLog.data),
    ]

    const events = chain.evm.decodeLogs([log])

    expect(events).toHaveLength(1)
    expect(events[0]).toEqual({
      name: 'unshield',
      assetId: Asset.nativeId(),
      amount: 20n * 10n ** 8n,
    })
  })
})
