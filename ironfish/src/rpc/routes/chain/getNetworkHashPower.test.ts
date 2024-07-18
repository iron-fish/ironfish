/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities/fixtures'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'
import { RPC_ERROR_CODES } from '../../adapters'

describe('Route chain/getNetworkHashPower', () => {
  const routeTest = createRouteTest(true)
  let sender: Account

  beforeAll(async () => {
    sender = await useAccountFixture(routeTest.node.wallet, 'existingAccount')
  })

  it('should succeed with default values', async () => {
    for (let i = 0; i < 5; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])
      await Promise.all([routeTest.node.wallet.scan()])
    }
    const response = await routeTest.client.chain.getNetworkHashPower()

    expect(response.content).toEqual(
      expect.objectContaining({
        hashesPerSecond: expect.any(Number),
        blocks: expect.any(Number),
        sequence: expect.any(Number),
      }),
    )
  })

  it('should succeed with valid negative sequence value', async () => {
    for (let i = 0; i < 5; ++i) {
      const block = await useMinerBlockFixture(
        routeTest.chain,
        undefined,
        sender,
        routeTest.node.wallet,
      )

      await Promise.all([expect(routeTest.node.chain).toAddBlock(block)])
      await Promise.all([routeTest.node.wallet.scan()])
    }

    const offset = -3

    const response = await routeTest.client.chain.getNetworkHashPower({
      blocks: 100,
      sequence: offset,
    })

    const expectedSequence = routeTest.node.chain.head.sequence + offset

    expect(response.content).toEqual(
      expect.objectContaining({
        hashesPerSecond: expect.any(Number),
        sequence: expectedSequence,
        blocks: expectedSequence - 1,
      }),
    )
  })

  it('should fail with a negative [blocks] value', async () => {
    await expect(
      routeTest.client.chain.getNetworkHashPower({
        blocks: -1,
      }),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining('[blocks] value must be greater than 0'),
        status: 400,
        code: RPC_ERROR_CODES.VALIDATION,
      }),
    )
  })

  it('should return 0 network hash power if start block == end block', async () => {
    const response = await routeTest.client.chain.getNetworkHashPower({
      blocks: 1,
      sequence: 1,
    })

    expect(response.content).toEqual(
      expect.objectContaining({
        hashesPerSecond: 0,
        blocks: 0,
        sequence: 1,
      }),
    )
  })
})
