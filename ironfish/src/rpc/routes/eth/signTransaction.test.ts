/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Address, hexToBytes } from '@ethereumjs/util'
import { useAccountFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'

describe('Route eth/signTransaction', () => {
  const routeTest = createRouteTest()

  it('should construct evm transaction and sign/return', async () => {
    const senderIf = await useAccountFixture(routeTest.node.wallet, 'sender')

    const evmPrivateKey = Uint8Array.from(Buffer.from(senderIf.spendingKey || '', 'hex'))

    const evmSenderAddress = Address.fromPrivateKey(evmPrivateKey)

    const response = await routeTest.client.eth.signTransaction({
      nonce: '0x0',
      to: evmSenderAddress.toString(),
      from: evmSenderAddress.toString(),
      value: '0xEE6B280', // 250000000
    })

    expect(response.status).toEqual(200)
    const tx = LegacyTransaction.fromSerializedTx(hexToBytes(response.content))
    expect(tx.getSenderAddress().toString()).toEqual(evmSenderAddress.toString())
    expect(tx.nonce).toEqual(0n)
    expect(tx.value).toEqual(250000000n)
  })

  it('should fail if from address is not in wallet', async () => {
    await expect(
      routeTest.client.eth.signTransaction({
        nonce: '0x0',
        to: '0x1234567890123456789012345678901234567890',
        from: '0x1234567890123456789012345678901234567890',
        value: '0xEE6B280', // 250000000
      }),
    ).rejects.toThrow(
      'Request failed (400) error: Account not found for address 0x1234567890123456789012345678901234567890',
    )
  })
})
