/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address } from '@ethereumjs/util'
import { Consensus } from '../../../consensus'
import { TransactionVersion } from '../../../primitives'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/getTransactionCount', () => {
  const routeTest = createRouteTest()

  beforeAll(() => {
    jest
      .spyOn(Consensus.prototype, 'getActiveTransactionVersion')
      .mockImplementation(() => TransactionVersion.V3)
  })

  it('should call retrieve correct transaction count', async () => {
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

    const result = await routeTest.client.eth.getTransactionCount([
      evmSenderAddress.toString(),
      'latest',
    ])

    expect(result.status).toEqual(200)
    expect(result.content).toEqual('0x1')
  })
})
