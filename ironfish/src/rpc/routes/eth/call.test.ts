/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import { GoldTokenJson } from '@ironfish/ironfish-contracts'
import { ethers } from 'ethers'
import { Consensus } from '../../../consensus'
import { TransactionVersion } from '../../../primitives'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { EthUtils } from '../../../utils'

describe('Route eth/call', () => {
  const routeTest = createRouteTest()

  beforeAll(() => {
    jest
      .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
      .mockImplementation(() => TransactionVersion.V3)
  })

  it('should call evm and return balance of contract', async () => {
    const senderIf = await useAccountFixture(routeTest.node.wallet, 'sender')
    const evmPrivateKey = Uint8Array.from(Buffer.from(senderIf.spendingKey || '', 'hex'))

    const evmSenderAddress = Address.fromPrivateKey(evmPrivateKey)
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

    const goldContract = new ethers.Interface(GoldTokenJson.abi)
    const data = goldContract.encodeFunctionData('balanceOf', [evmSenderAddress.toString()])

    // TODO hardcoded since we currently don't have ability to get transaction receipt
    const response = await routeTest.client.eth.call({
      to: '0x3401b9805c0a69760ff824cbb8cd14da33e55ebc',
      input: data,
    })
    expect(response.status).toEqual(200)
    const uint256Value = BigInt(EthUtils.prefix0x(response.content.result))
    expect(uint256Value).toEqual(initialMintValue)
  })
})
