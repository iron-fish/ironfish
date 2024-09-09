/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Log } from '@ethereumjs/evm'
import { LegacyTransaction } from '@ethereumjs/tx'
import { bytesToHex, hexToBytes } from '@ethereumjs/util'
import { Asset } from '@ironfish/rust-nodejs'
import { ethers, keccak256, toUtf8Bytes } from 'ethers'
import { Assert } from '../../../assert'
import { Consensus } from '../../../consensus'
import { ContractArtifact, GLOBAL_CONTRACT_ADDRESS } from '../../../evm'
import { Block, Transaction, TransactionVersion } from '../../../primitives'
import {
  evmDescriptionToLegacyTransaction,
  legacyTransactionToEvmDescription,
} from '../../../primitives/evmDescription'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EthUtils } from '../../../utils'

describe('Route eth/getLogs', () => {
  const routeTest = createRouteTest(true)
  let transaction: Transaction
  let blockEvm: Block

  beforeAll(async () => {
    jest
      .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
      .mockImplementation(() => TransactionVersion.V3)

    const { chain, wallet } = routeTest.node

    const account = await useAccountFixture(wallet)
    Assert.isNotNull(account.ethAddress)

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    // Give account some IRON
    const block = await useMinerBlockFixture(chain, undefined, account)
    await chain.addBlock(block)
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

    const { events: evmEvents } = await chain.evm.simulateTx({
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

    transaction = raw.post(account.spendingKey)

    blockEvm = await useMinerBlockFixture(chain, undefined, undefined, undefined, [transaction])

    await chain.addBlock(blockEvm)
  })

  it('should retrieve logs from latest block by default', async () => {
    const { chain } = routeTest.node

    const ethHash = evmDescriptionToLegacyTransaction(transaction.evm!).hash()

    const result = await routeTest.client.eth.getLogs({})

    expect(result.status).toEqual(200)
    expect(result.content).toMatchObject([
      expect.objectContaining({
        transactionHash: bytesToHex(ethHash),
        transactionIndex: '0x1',
        blockHash: EthUtils.prefix0x(blockEvm.header.hash.toString('hex')),
        blockNumber: EthUtils.numToHex(EthUtils.ifToEthSequence(3)),
        address: GLOBAL_CONTRACT_ADDRESS.toString(),
        data: '0x000000000000000000000000ffffffffffffffffffffffffffffffffffffffff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000077359400',
        logIndex: '0x0',
        removed: false,
        topics: ['0xac7fb4669ee6bcb4e65d1a3ed26d30037ba448f57ef727751be6c72f66fc4281'],
      }),
    ])

    const resultLog = result.content[0]

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

  it('should filter logs by address', async () => {
    const emptyResult = await routeTest.client.eth.getLogs({
      address: EthUtils.prefix0x('a'.repeat(40)),
    })

    expect(emptyResult.status).toEqual(200)
    expect(emptyResult.content).toMatchObject([])

    const result = await routeTest.client.eth.getLogs({
      address: GLOBAL_CONTRACT_ADDRESS.toString(),
    })

    expect(result.status).toEqual(200)
    expect(result.content).toMatchObject([
      {
        address: GLOBAL_CONTRACT_ADDRESS.toString(),
      },
    ])
  })

  it('should filter logs by topic', async () => {
    const emptyResult = await routeTest.client.eth.getLogs({
      topics: [EthUtils.prefix0x('a'.repeat(64))],
    })

    expect(emptyResult.status).toEqual(200)
    expect(emptyResult.content).toMatchObject([])

    const topic = keccak256(toUtf8Bytes('UnShield(address,uint256,uint256)'))

    const result = await routeTest.client.eth.getLogs({
      topics: [topic],
    })

    expect(result.status).toEqual(200)
    expect(result.content).toMatchObject([
      {
        address: GLOBAL_CONTRACT_ADDRESS.toString(),
      },
    ])
  })

  it('should retrieve logs by blockHash', async () => {
    const { chain } = routeTest
    const emptyResult = await routeTest.client.eth.getLogs({
      blockHash: bytesToHex(chain.genesis.hash),
    })

    expect(emptyResult.status).toEqual(200)
    expect(emptyResult.content).toMatchObject([])

    const result = await routeTest.client.eth.getLogs({
      blockHash: bytesToHex(blockEvm.header.hash),
    })

    expect(result.status).toEqual(200)
    expect(result.content).toHaveLength(1)
  })

  it('should retrieve logs using to/from block', async () => {
    const result = await routeTest.client.eth.getLogs({
      fromBlock: EthUtils.numToHex(EthUtils.ifToEthSequence(3)),
      toBlock: EthUtils.numToHex(EthUtils.ifToEthSequence(3)),
    })

    expect(result.status).toEqual(200)
    expect(result.content).toHaveLength(1)
  })
})
