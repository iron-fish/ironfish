/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address, bytesToHex } from '@ethereumjs/util'
import { Consensus } from '../../../consensus'
import { TransactionVersion } from '../../../primitives'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EthUtils } from '../../../utils'

describe('Route eth/getBlockByHash', () => {
  const routeTest = createRouteTest()

  beforeAll(() => {
    jest
      .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
      .mockImplementation(() => TransactionVersion.V3)
  })

  it('should call retrieve correct block/transaction info', async () => {
    const senderIf = await useAccountFixture(routeTest.node.wallet, 'sender')
    const evmPrivateKey = Uint8Array.from(Buffer.from(senderIf.spendingKey || '', 'hex'))

    const evmSenderAddress = Address.fromPrivateKey(evmPrivateKey)
    const raw = await routeTest.wallet.createEvmTransaction({
      evm: {
        nonce: 0n,
        value: 0n,
        gasLimit: 1000000000n,
        gasPrice: 0n,
        privateIron: BigInt(0),
        publicIron: BigInt(0),
        to: undefined,
        data: Buffer.alloc(0),
      },
    })

    const transaction = raw.post(senderIf.spendingKey)

    const block1 = await useMinerBlockFixture(
      routeTest.node.chain,
      undefined,
      undefined,
      undefined,
      [transaction],
    )
    await expect(routeTest.node.chain).toAddBlock(block1)
    await routeTest.node.wallet.scan()

    const ethHash = evmDescriptionToLegacyTransaction(transaction.evm!).hash()
    const ethHashString = bytesToHex(ethHash)
    const result = await routeTest.client.eth.getBlockByHash([
      EthUtils.prefix0x(block1.header.hash.toString('hex')),
      true,
    ])

    expect(result.status).toEqual(200)

    expect(result.content.transactions[0]).toMatchObject({
      blockHash: EthUtils.prefix0x(block1.header.hash.toString('hex')),
      blockNumber: EthUtils.numToHex(EthUtils.ifToEthSequence(2)),
      from: EthUtils.prefix0x(evmSenderAddress.toString()),
      gas: '0x3b9aca00',
      gasPrice: '0x0',
      maxFeePerGas: '0x0',
      maxPriorityFeePerGas: '0x0',
      hash: EthUtils.prefix0x(Buffer.from(ethHash).toString('hex')),
      input: '0x',
      nonce: '0x0',
      to: null,
      transactionIndex: '0x1',
      value: '0x0',
      type: '0x0',
      accessList: [],
      chainId: '0x42069',
      v: '0x1c',
      r: expect.stringMatching(/^0x/),
      s: expect.stringMatching(/^0x/),
    })

    const resultTruncated = await routeTest.client.eth.getBlockByNumber([
      EthUtils.numToHex(EthUtils.ifToEthSequence(2)),
      false,
    ])
    expect(resultTruncated.content.transactions[0]).toEqual(ethHashString)
  })
})
