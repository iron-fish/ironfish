/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { bytesToHex } from '@ethereumjs/util'
import { GoldTokenJson } from '@ironfish/ironfish-contracts'
import { ethers } from 'ethers'
import { Assert } from '../../../assert'
import { Consensus } from '../../../consensus'
import { TransactionVersion } from '../../../primitives'
import { evmDescriptionToLegacyTransaction } from '../../../primitives/evmDescription'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EthUtils } from '../../../utils'

describe('Route eth/getCode', () => {
  const routeTest = createRouteTest()

  beforeAll(() => {
    jest
      .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
      .mockImplementation(() => TransactionVersion.V3)
  })

  it('should call retrieve correct transaction code', async () => {
    const senderIf = await useAccountFixture(routeTest.node.wallet, 'sender')
    const initialMintValue = 1000000n

    const factory = new ethers.ContractFactory(GoldTokenJson.abi, GoldTokenJson.bytecode)
    const ironfishContractAddress = '0xffffffffffffffffffffffffffffffffffffffff'
    const contract = await factory.getDeployTransaction(
      initialMintValue,
      ironfishContractAddress,
    )

    const raw = await routeTest.wallet.createEvmTransaction({
      evm: {
        nonce: 0n,
        value: 0n,
        gasLimit: 1000000000n,
        gasPrice: 0n,
        privateIron: BigInt(0),
        publicIron: BigInt(0),
        to: undefined,
        data: Buffer.from(EthUtils.remove0x(contract.data), 'hex'),
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

    const receipt = await routeTest.client.eth.getTransactionReceipt([
      bytesToHex(evmDescriptionToLegacyTransaction(transaction.evm!).hash()),
    ])
    Assert.isTruthy(receipt.content.contractAddress)
    const result = await routeTest.client.eth.getCode([
      receipt.content.contractAddress,
      'latest',
    ])

    expect(result.status).toEqual(200)
    expect(result.content).toMatch(/0x[0-9a-fA-F]+/)
  })
})
